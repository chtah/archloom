import os

import httpx

from forecast import fetch_forecast

POSTBIRD_URL = "https://api.postbird.example/send"


async def send_morning_digest(db) -> None:
    """Runs at 06:00: email every hiker the forecast for the trails they wrote about."""
    rows = db().execute("select distinct email, trail from notes").fetchall()
    async with httpx.AsyncClient() as client:
        for email, trail in rows:
            forecast = await fetch_forecast(trail)
            await client.post(POSTBIRD_URL, json={"to": email, "subject": f"Today on {trail}", "text": forecast["summary"]},
                              headers={"authorization": f"Bearer {os.environ['POSTBIRD_KEY']}"})
