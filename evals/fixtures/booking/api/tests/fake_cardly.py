"""A stand-in for Cardly used only by the test suite."""
from fastapi import FastAPI

fake = FastAPI()


@fake.post("/v1/deposits")
def deposit():
    return {"id": "dep_test_1"}
