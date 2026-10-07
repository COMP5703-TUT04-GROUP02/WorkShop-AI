import re

import pytest

from backend.services.faq_service import FaqFormatError, get_faq, parse_faq


def test_customer_faq_file_parses_with_stable_ids():
    categories = get_faq("customer")

    assert [category["title"] for category in categories] == [
        "Account and profile",
        "Finding and contacting providers",
        "Booking requests",
        "Quotes and payments",
        "Visit and service completion",
        "Cancellations and refunds",
        "Reviews",
        "AI assistant",
    ]
    items = [item for category in categories for item in category["items"]]
    assert len(items) == 50
    for item in items:
        assert re.fullmatch(r"CUST-[A-Z]+-\d{3}", item["id"])
        assert item["question"].endswith("?")
        assert item["answer"]


def test_customer_faq_has_no_developer_setup_text():
    text = " ".join(
        f"{item['question']} {item['answer']}"
        for category in get_faq("customer")
        for item in category["items"]
    )
    for phrase in ("Expo Go", "development build", "Sandbox", "configured by an administrator"):
        assert phrase not in text


def test_faq_endpoint_is_public(client):
    response = client.get("/faq")

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["audience"] == "customer"
    first = data["categories"][0]["items"][0]
    assert first["id"] == "CUST-ACC-001"
    assert first["question"] == "How do I create a customer account?"


def test_faq_endpoint_rejects_unknown_audience(client):
    assert client.get("/faq", params={"audience": "provider"}).status_code == 422


def test_parse_faq_rejects_duplicate_ids():
    markdown = """## A

### CUST-A-001

**Question: One?**

**Answer:** Yes.

### CUST-A-001

**Question: Two?**

**Answer:** No.
"""
    with pytest.raises(FaqFormatError, match="duplicate id"):
        parse_faq(markdown)


def test_parse_faq_rejects_entry_without_answer():
    markdown = """## A

### CUST-A-001

**Question: One?**
"""
    with pytest.raises(FaqFormatError, match="question and an answer"):
        parse_faq(markdown)
