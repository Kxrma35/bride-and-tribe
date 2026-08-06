import base64
import os
from datetime import datetime

import requests

BASE_URL = {
    "sandbox": "https://sandbox.safaricom.co.ke",
    "production": "https://api.safaricom.co.ke",
}


def _base():
    return BASE_URL[os.environ.get("DARAJA_ENV", "sandbox")]


def _token():
    key = os.environ["DARAJA_CONSUMER_KEY"]
    secret = os.environ["DARAJA_CONSUMER_SECRET"]
    creds = base64.b64encode(f"{key}:{secret}".encode()).decode()
    r = requests.get(
        f"{_base()}/oauth/v1/generate?grant_type=client_credentials",
        headers={"Authorization": f"Basic {creds}"},
        timeout=30,
    )
    r.raise_for_status()
    return r.json()["access_token"]


def normalize_phone(phone: str) -> str:
    p = str(phone).replace(" ", "").replace("+", "").replace("-", "")
    if p.startswith("0"):
        p = "254" + p[1:]
    if not (p.startswith("2547") or p.startswith("2541")) or len(p) != 12:
        raise ValueError("Use a valid Kenyan number, e.g. 07XXXXXXXX")
    return p


def stk_push(phone: str, amount: int, account_ref: str) -> dict:
    shortcode = os.environ.get("DARAJA_SHORTCODE", "174379")
    passkey = os.environ["DARAJA_PASSKEY"]
    ts = datetime.now().strftime("%Y%m%d%H%M%S")
    password = base64.b64encode(f"{shortcode}{passkey}{ts}".encode()).decode()

    payload = {
        "BusinessShortCode": shortcode,
        "Password": password,
        "Timestamp": ts,
        "TransactionType": "CustomerPayBillOnline",
        "Amount": max(1, int(amount)),
        "PartyA": normalize_phone(phone),
        "PartyB": shortcode,
        "PhoneNumber": normalize_phone(phone),
        "CallBackURL": os.environ.get("DARAJA_CALLBACK_URL", "https://example.com/api/mpesa/callback"),
        "AccountReference": account_ref[:12],
        "TransactionDesc": "Bride & Tribe",
    }
    r = requests.post(
        f"{_base()}/mpesa/stkpush/v1/processrequest",
        json=payload,
        headers={"Authorization": f"Bearer {_token()}"},
        timeout=30,
    )
    data = r.json()
    if "errorCode" in data:
        raise RuntimeError(data.get("errorMessage", "STK push failed"))
    return data


def stk_query(checkout_request_id: str) -> dict:
    shortcode = os.environ.get("DARAJA_SHORTCODE", "174379")
    passkey = os.environ["DARAJA_PASSKEY"]
    ts = datetime.now().strftime("%Y%m%d%H%M%S")
    password = base64.b64encode(f"{shortcode}{passkey}{ts}".encode()).decode()
    r = requests.post(
        f"{_base()}/mpesa/stkpushquery/v1/query",
        json={
            "BusinessShortCode": shortcode,
            "Password": password,
            "Timestamp": ts,
            "CheckoutRequestID": checkout_request_id,
        },
        headers={"Authorization": f"Bearer {_token()}"},
        timeout=30,
    )
    return r.json()