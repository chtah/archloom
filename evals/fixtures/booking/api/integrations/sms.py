"""SMS reminders through Textwave. Written for a pilot that never launched; nothing imports this module."""
import httpx


def send_reminder(phone: str, text: str) -> None:
    httpx.post("https://api.textwave.example/messages", json={"to": phone, "text": text})
