import os

import httpx

SKYCAST_URL = "https://api.skycast.example/v3/forecast"


async def fetch_forecast(trail: str) -> dict:
    """Ask SkyCast, an outside weather provider, for today's forecast."""
    async with httpx.AsyncClient() as client:
        response = await client.get(SKYCAST_URL, params={"q": trail}, headers={"x-api-key": os.environ["SKYCAST_KEY"]})
        return response.json()
