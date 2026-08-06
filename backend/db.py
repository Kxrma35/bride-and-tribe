import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "brideandtribe.db"


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row  # rows behave like dicts
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS dresses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    designer TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'wedding',
    style_code TEXT,
    description TEXT,
    price_kes INTEGER NOT NULL,
    image_url TEXT,
    available INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    dress_id INTEGER NOT NULL REFERENCES dresses(id),
    amount_kes INTEGER NOT NULL,
    order_type TEXT NOT NULL DEFAULT 'deposit',
    status TEXT NOT NULL DEFAULT 'pending',
    checkout_request_id TEXT,
    mpesa_receipt TEXT,
    phone TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    preferred_date TEXT,
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS testimonials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    author TEXT NOT NULL,
    body TEXT NOT NULL
);
"""

SEED_DRESSES = [
    ("Amara", "Allure Bridals", "wedding", "A1201", "Fitted mermaid gown with hand-beaded lace bodice.", 185000),
    ("Zawadi", "Allure Bridals", "wedding", "A1214", "Classic ballgown with sweetheart neckline.", 210000),
    ("Neema", "Allure Romance", "wedding", "R3410", "Soft A-line gown in shimmering chiffon.", 145000),
    ("Imani", "Lillian West", "wedding", "LW6620", "Bohemian sheath with bell sleeves and vintage lace.", 158000),
    ("Adia", "Lillian West", "wedding", "LW6633", "Off-shoulder crepe gown with detachable overskirt.", 172000),
    ("Sifa", "Allure Bridals", "wedding", "A1230", "Deep V plunge gown with crystal straps.", 198000),
    ("Tulia", "Bride and Tribe Atelier", "formal", "BT2101", "Emerald satin evening gown with cowl neck.", 68000),
    ("Furaha", "Bride and Tribe Atelier", "formal", "BT2115", "Dusty-rose chiffon bridesmaid dress.", 38000),
]

SEED_TESTIMONIALS = [
    ("Lindsey K.", "It was perfect. I walked away feeling so beautiful."),
    ("Hailey H.", "The whole team made the process so fun and easy."),
    ("Nicole R.", "They helped me find the perfect dress. Everyone is still talking about it."),
]


def init_db():
    db = get_db()
    db.executescript(SCHEMA)
    if db.execute("SELECT COUNT(*) FROM dresses").fetchone()[0] == 0:
        db.executemany(
            "INSERT INTO dresses (name, designer, category, style_code, description, price_kes) VALUES (?,?,?,?,?,?)",
            SEED_DRESSES,
        )
        db.executemany("INSERT INTO testimonials (author, body) VALUES (?,?)", SEED_TESTIMONIALS)
        db.commit()
    db.close()