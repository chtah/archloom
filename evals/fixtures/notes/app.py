import sqlite3
from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI

from forecast import fetch_forecast
from jobs import send_morning_digest

DB_PATH = "notes.db"


def db() -> sqlite3.Connection:
    return sqlite3.connect(DB_PATH)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # The scheduler runs inside this process; there is no separate worker.
    scheduler = AsyncIOScheduler()
    scheduler.add_job(send_morning_digest, "cron", hour=6, args=[db])
    scheduler.start()
    yield
    scheduler.shutdown()


app = FastAPI(lifespan=lifespan)


@app.get("/notes")
def list_notes():
    return db().execute("select id, trail, body from notes order by id desc").fetchall()


@app.post("/notes")
def add_note(trail: str, body: str, email: str):
    with db() as connection:
        connection.execute("insert into notes (trail, body, email) values (?, ?, ?)", (trail, body, email))
    return {"ok": True}


@app.get("/trails/{trail}/forecast")
async def forecast(trail: str):
    return await fetch_forecast(trail)
