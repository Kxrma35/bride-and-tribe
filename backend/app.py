import os
from datetime import datetime, timedelta, timezone

import jwt
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS
from werkzeug.security import check_password_hash, generate_password_hash

from db import get_db, init_db
import mpesa

load_dotenv()

app = Flask(__name__)
CORS(app)

JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret-change-me")


# ---------- helpers ----------

def make_token(user):
    payload = {
        "id": user["id"],
        "name": user["name"],
        "email": user["email"],
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def current_user():
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    try:
        return jwt.decode(header[7:], JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None


# ---------- health ----------

@app.route("/api/health")
def health():
    return jsonify({"ok": True, "service": "bride-and-tribe"})


# ---------- auth ----------

@app.route("/api/auth/register", methods=["POST"])
def register():
    data = request.get_json(silent=True) or {}
    name = data.get("name", "").strip()
    email = data.get("email", "").strip().lower()
    password = data.get("password", "")
    if not name or not email or not password:
        return jsonify({"error": "Name, email and password are required"}), 400
    if len(password) < 8:
        return jsonify({"error": "Password must be at least 8 characters"}), 400

    db = get_db()
    try:
        cur = db.execute(
            "INSERT INTO users (name, email, phone, password_hash) VALUES (?,?,?,?)",
            (name, email, data.get("phone"), generate_password_hash(password)),
        )
        db.commit()
        user = db.execute("SELECT * FROM users WHERE id = ?", (cur.lastrowid,)).fetchone()
    except Exception:
        return jsonify({"error": "An account with this email already exists"}), 409
    finally:
        db.close()
    return jsonify({"token": make_token(user), "user": {"id": user["id"], "name": name, "email": email}}), 201


@app.route("/api/auth/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    db = get_db()
    user = db.execute(
        "SELECT * FROM users WHERE email = ?", (data.get("email", "").strip().lower(),)
    ).fetchone()
    db.close()
    if not user or not check_password_hash(user["password_hash"], data.get("password", "")):
        return jsonify({"error": "Incorrect email or password"}), 401
    return jsonify({
        "token": make_token(user),
        "user": {"id": user["id"], "name": user["name"], "email": user["email"]},
    })


# ---------- dresses ----------

@app.route("/api/dresses")
def list_dresses():
    category = request.args.get("category")
    designer = request.args.get("designer")
    sql = "SELECT * FROM dresses WHERE 1=1"
    params = []
    if category:
        sql += " AND category = ?"
        params.append(category)
    if designer:
        sql += " AND designer = ?"
        params.append(designer)
    db = get_db()
    rows = db.execute(sql + " ORDER BY id", params).fetchall()
    db.close()
    return jsonify({"dresses": [dict(r) for r in rows]})


@app.route("/api/dresses/<int:dress_id>")
def get_dress(dress_id):
    db = get_db()
    row = db.execute("SELECT * FROM dresses WHERE id = ?", (dress_id,)).fetchone()
    db.close()
    if not row:
        return jsonify({"error": "Dress not found"}), 404
    return jsonify({"dress": dict(row)})


# ---------- testimonials and appointments ----------

@app.route("/api/testimonials")
def testimonials():
    db = get_db()
    rows = db.execute("SELECT * FROM testimonials ORDER BY id").fetchall()
    db.close()
    return jsonify({"testimonials": [dict(r) for r in rows]})


@app.route("/api/appointments", methods=["POST"])
def create_appointment():
    data = request.get_json(silent=True) or {}
    if not data.get("name") or not data.get("phone"):
        return jsonify({"error": "Name and phone are required"}), 400
    db = get_db()
    db.execute(
        "INSERT INTO appointments (name, phone, email, preferred_date, notes) VALUES (?,?,?,?,?)",
        (data["name"], data["phone"], data.get("email"), data.get("preferred_date"), data.get("notes")),
    )
    db.commit()
    db.close()
    return jsonify({"ok": True}), 201


# ---------- M-Pesa ----------

@app.route("/api/mpesa/pay", methods=["POST"])
def mpesa_pay():
    user = current_user()
    if not user:
        return jsonify({"error": "Sign in to continue"}), 401
    data = request.get_json(silent=True) or {}
    dress_id = data.get("dressId")
    phone = data.get("phone")
    order_type = data.get("orderType", "deposit")
    if not dress_id or not phone:
        return jsonify({"error": "Dress and phone number are required"}), 400

    db = get_db()
    dress = db.execute("SELECT * FROM dresses WHERE id = ?", (dress_id,)).fetchone()
    if not dress:
        db.close()
        return jsonify({"error": "Dress not found"}), 404

    amount = dress["price_kes"] if order_type == "full" else -(-dress["price_kes"] * 3 // 10)

    try:
        cur = db.execute(
            "INSERT INTO orders (user_id, dress_id, amount_kes, order_type, phone) VALUES (?,?,?,?,?)",
            (user["id"], dress_id, amount, order_type, phone),
        )
        db.commit()
        order_id = cur.lastrowid
        result = mpesa.stk_push(phone, amount, f"BT-{order_id}")
        db.execute(
            "UPDATE orders SET checkout_request_id = ? WHERE id = ?",
            (result["CheckoutRequestID"], order_id),
        )
        db.commit()
        return jsonify({
            "orderId": order_id,
            "message": result.get("CustomerMessage", "Check your phone to complete payment"),
            "amount": amount,
        })
    except (ValueError, RuntimeError) as e:
        return jsonify({"error": str(e)}), 502
    finally:
        db.close()


@app.route("/api/mpesa/callback", methods=["POST"])
def mpesa_callback():
    body = request.get_json(silent=True) or {}
    cb = body.get("Body", {}).get("stkCallback")
    if cb:
        receipt = None
        if cb.get("ResultCode") == 0:
            for item in cb.get("CallbackMetadata", {}).get("Item", []):
                if item.get("Name") == "MpesaReceiptNumber":
                    receipt = item.get("Value")
        db = get_db()
        db.execute(
            "UPDATE orders SET status = ?, mpesa_receipt = ? WHERE checkout_request_id = ?",
            ("paid" if cb.get("ResultCode") == 0 else "failed", receipt, cb.get("CheckoutRequestID")),
        )
        db.commit()
        db.close()
    return jsonify({"ResultCode": 0, "ResultDesc": "Accepted"})


@app.route("/api/mpesa/status/<int:order_id>")
def mpesa_status(order_id):
    user = current_user()
    if not user:
        return jsonify({"error": "Sign in to continue"}), 401
    db = get_db()
    order = db.execute(
        "SELECT * FROM orders WHERE id = ? AND user_id = ?", (order_id, user["id"])
    ).fetchone()
    if not order:
        db.close()
        return jsonify({"error": "Order not found"}), 404

    status = order["status"]
    if status == "pending" and order["checkout_request_id"]:
        try:
            q = mpesa.stk_query(order["checkout_request_id"])
            code = str(q.get("ResultCode", ""))
            if code == "0":
                status = "paid"
            elif code and code != "500.001.1001":
                status = "failed"
            if status != "pending":
                db.execute("UPDATE orders SET status = ? WHERE id = ?", (status, order_id))
                db.commit()
        except Exception:
            pass
    db.close()
    return jsonify({"order": {"id": order_id, "status": status, "amount_kes": order["amount_kes"]}})


@app.route("/api/orders")
def my_orders():
    user = current_user()
    if not user:
        return jsonify({"error": "Sign in to continue"}), 401
    db = get_db()
    rows = db.execute(
        """SELECT o.id, o.amount_kes, o.order_type, o.status, o.mpesa_receipt, o.created_at,
                  d.name AS dress_name, d.designer
           FROM orders o JOIN dresses d ON d.id = o.dress_id
           WHERE o.user_id = ? ORDER BY o.created_at DESC""",
        (user["id"],),
    ).fetchall()
    db.close()
    return jsonify({"orders": [dict(r) for r in rows]})

# ---------- Appointment bookings (KES 5,000 reservation) ----------

BOOKING_FEE_KES = 5000


@app.route("/api/bookings/pay", methods=["POST"])
def booking_pay():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    phone = (data.get("phone") or "").strip()
    mpesa_phone = (data.get("mpesaPhone") or phone).strip()
    if not name or not phone:
        return jsonify({"error": "Name and phone number are required"}), 400

    user = current_user()
    db = get_db()
    try:
        cur = db.execute(
            """INSERT INTO appointments (name, phone, email, preferred_date, time_slot, notes)
               VALUES (?,?,?,?,?,?)""",
            (name, phone, data.get("email"), data.get("date"), data.get("time"), data.get("notes")),
        )
        appointment_id = cur.lastrowid
        cur = db.execute(
            """INSERT INTO orders (user_id, appointment_id, amount_kes, order_type, phone)
               VALUES (?,?,?,?,?)""",
            (user["id"] if user else None, appointment_id, BOOKING_FEE_KES, "booking", mpesa_phone),
        )
        db.commit()
        order_id = cur.lastrowid

        result = mpesa.stk_push(mpesa_phone, BOOKING_FEE_KES, f"BT-A{order_id}")
        db.execute(
            "UPDATE orders SET checkout_request_id = ? WHERE id = ?",
            (result["CheckoutRequestID"], order_id),
        )
        db.commit()
        return jsonify({"orderId": order_id, "amount": BOOKING_FEE_KES})
    except (ValueError, RuntimeError) as e:
        return jsonify({"error": str(e)}), 502
    finally:
        db.close()


@app.route("/api/bookings/status/<int:order_id>")
def booking_status(order_id):
    db = get_db()
    order = db.execute(
        "SELECT * FROM orders WHERE id = ? AND order_type = 'booking'", (order_id,)
    ).fetchone()
    if not order:
        db.close()
        return jsonify({"error": "Booking not found"}), 404

    status = order["status"]
    if status == "pending" and order["checkout_request_id"]:
        try:
            q = mpesa.stk_query(order["checkout_request_id"])
            code = str(q.get("ResultCode", ""))
            if code == "0":
                status = "paid"
            elif code and code != "500.001.1001":
                status = "failed"
            if status != "pending":
                db.execute("UPDATE orders SET status = ? WHERE id = ?", (status, order_id))
                if status == "paid":
                    db.execute(
                        "UPDATE appointments SET status = 'confirmed' WHERE id = ?",
                        (order["appointment_id"],),
                    )
                db.commit()
        except Exception:
            pass
    db.close()
    return jsonify({"order": {"id": order_id, "status": status, "amount_kes": order["amount_kes"]}})


init_db()
if __name__ == "__main__":
    app.run(debug=True, port=5000)