"""Direct iyzico Sandbox HTTP client.

This module intentionally models the iyzico API directly. It is not a generic
payment-provider abstraction; the payment flow is currently iyzico-specific.
"""

import base64
import hashlib
import hmac
import json
import secrets
import time
from typing import Any

import httpx

from backend.config import (
    IYZICO_API_KEY,
    IYZICO_BASE_URL,
    IYZICO_SECRET_KEY,
    IYZICO_TIMEOUT_SECONDS,
)


CHECKOUT_FORM_INITIALIZE_PATH = "/payment/iyzipos/checkoutform/initialize/auth/ecom"
CHECKOUT_FORM_RETRIEVE_PATH = "/payment/iyzipos/checkoutform/auth/ecom/detail"


class IyzicoClientError(RuntimeError):
    """Raised when iyzico cannot complete an API request."""

    def __init__(self, message: str, *, response_data: dict[str, Any] | None = None):
        super().__init__(message)
        self.response_data = response_data or {}


class IyzicoClient:
    def __init__(
        self,
        *,
        api_key: str = IYZICO_API_KEY,
        secret_key: str = IYZICO_SECRET_KEY,
        base_url: str = IYZICO_BASE_URL,
        timeout: float = IYZICO_TIMEOUT_SECONDS,
    ):
        self.api_key = api_key
        self.secret_key = secret_key
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def _ensure_configured(self) -> None:
        if not self.api_key or not self.secret_key:
            raise IyzicoClientError(
                "iyzico Sandbox credentials are not configured"
            )

    def _authorization_headers(self, path: str, body: str) -> dict[str, str]:
        self._ensure_configured()
        random_key = f"{int(time.time() * 1000)}{secrets.token_hex(8)}"
        signature_payload = f"{random_key}{path}{body}".encode("utf-8")
        signature = hmac.new(
            self.secret_key.encode("utf-8"),
            signature_payload,
            hashlib.sha256,
        ).hexdigest()
        authorization_string = (
            f"apiKey:{self.api_key}&randomKey:{random_key}&signature:{signature}"
        )
        encoded_authorization = base64.b64encode(
            authorization_string.encode("utf-8")
        ).decode("ascii")
        return {
            "Authorization": f"IYZWSv2 {encoded_authorization}",
            "Content-Type": "application/json",
            "x-iyzi-rnd": random_key,
        }

    async def _post(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        headers = self._authorization_headers(path, body)
        try:
            async with httpx.AsyncClient(
                base_url=self.base_url,
                timeout=self.timeout,
            ) as client:
                response = await client.post(path, content=body, headers=headers)
        except httpx.HTTPError as exc:
            raise IyzicoClientError("iyzico request failed") from exc

        try:
            response_data = response.json()
        except ValueError as exc:
            raise IyzicoClientError(
                "iyzico returned a non-JSON response"
            ) from exc

        if not isinstance(response_data, dict):
            raise IyzicoClientError("iyzico returned an invalid response")
        if response.status_code >= 400:
            raise IyzicoClientError(
                "iyzico rejected the request",
                response_data=response_data,
            )
        return response_data

    async def initialize_checkout_form(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self._post(CHECKOUT_FORM_INITIALIZE_PATH, payload)

    async def retrieve_checkout_form(
        self,
        *,
        token: str,
        conversation_id: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "locale": "en",
            "token": token,
        }
        if conversation_id:
            payload["conversationId"] = conversation_id
        return await self._post(CHECKOUT_FORM_RETRIEVE_PATH, payload)


def get_iyzico_client() -> IyzicoClient:
    return IyzicoClient()
