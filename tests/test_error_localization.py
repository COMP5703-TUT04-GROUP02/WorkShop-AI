import asyncio
import json

from fastapi import HTTPException, Request

from backend.utils.errors import http_exception_handler


def test_known_login_error_has_stable_key(client):
    response = client.post(
        "/login",
        data={"username": "missing@example.test", "password": "wrong-password"},
    )
    assert response.status_code == 401
    assert response.json()["error"]["key"] == "invalid_credentials"
    assert response.json()["error"]["detail"] == "Invalid email or password"


def test_unknown_http_error_has_generic_key():
    request = Request({"type": "http", "method": "GET", "path": "/", "headers": []})
    response = asyncio.run(http_exception_handler(request, HTTPException(status_code=418, detail="Vendor detail")))
    result = json.loads(response.body)
    assert result["error"]["key"] == "request_failed"
    assert result["error"]["detail"] == "Vendor detail"
