import os

import httpx
import psycopg
from fastapi import FastAPI

app = FastAPI()
CARDLY_URL = os.environ["CARDLY_URL"]


def db():
    return psycopg.connect(os.environ["DATABASE_URL"])


@app.get("/courts")
def courts(q: str = ""):
    with db() as connection:
        return connection.execute("select id, name from courts where name ilike %s", (f"%{q}%",)).fetchall()


@app.post("/bookings")
def create_booking(court_id: int, slot: str):
    deposit = httpx.post(f"{CARDLY_URL}/deposits", json={"amount_cents": 500},
                         headers={"authorization": f"Bearer {os.environ['CARDLY_KEY']}"})
    deposit.raise_for_status()
    with db() as connection:
        row = connection.execute("insert into bookings (court_id, slot, deposit_id) values (%s, %s, %s) returning id",
                                 (court_id, slot, deposit.json()["id"])).fetchone()
    return {"id": row[0]}
