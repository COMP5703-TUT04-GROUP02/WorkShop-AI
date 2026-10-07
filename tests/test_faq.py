import re

import pytest

from backend.ai.tools import search_help_articles_tool
from backend.services.faq_service import FaqFormatError, get_faq, parse_faq, search_faq


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


def test_search_faq_ranks_question_matches_and_handles_word_forms():
    assert [item["id"] for item in search_faq("customer", "payment failed")][0] == "CUST-PAY-007"
    assert search_faq("customer", "cancelling a booking")[0]["id"] == "CUST-REF-001"
    assert search_faq("customer", "provider rejected my refund")[0]["id"] == "CUST-REF-007"
    assert search_faq("customer", "the of and") == []


def test_help_tool_answers_with_best_article_and_returns_all_matches():
    result = search_help_articles_tool("partial refund")

    assert [article["id"] for article in result["articles"]][0] == "CUST-REF-005"
    assert len(result["articles"]) > 1
    assert result["answer"] == (
        "**Can I request a partial refund?**\n\n" + result["articles"][0]["answer"]
    )


def test_help_tool_points_to_help_centre_when_nothing_matches():
    result = search_help_articles_tool("zzz")

    assert result["articles"] == []
    assert "Help and Support" in result["answer"]


def test_ai_chat_returns_help_article_links(client, marketplace, monkeypatch):
    def fake_tool_calling(message, *_args, **_kwargs):
        args = {"query": "payment stays pending"}
        result = search_help_articles_tool(**args)
        return {
            "message": message,
            "type": "tool_call",
            "answer": result["answer"],
            "tool_calls": [{"name": "search_help_articles", "args": args}],
            "tool_results": [
                {"tool_name": "search_help_articles", "tool_args": args, "result": result}
            ],
        }

    monkeypatch.setattr(
        "backend.utils.ai_chat_handler.choose_and_run_langchain_tools",
        fake_tool_calling,
    )
    response = client.post(
        "/ai/chat/sync",
        json={"message": "My payment is stuck on pending, what should I do?"},
        headers=marketplace["customer"]["headers"],
    )

    assert response.status_code == 200, response.text
    body = response.json()["data"]
    assert body["type"] == "help_articles"
    assert body["help_articles"][0] == {
        "id": "CUST-PAY-007",
        "question": "What should I do if a payment fails or stays pending?",
    }

    history = client.get("/ai/chat/messages", headers=marketplace["customer"]["headers"])
    assistant = [
        item for item in history.json()["data"]["items"] if item["role"] == "assistant"
    ][-1]
    assert assistant["metadata"]["help_articles"][0]["id"] == "CUST-PAY-007"


def test_search_faq_drops_weak_matches_next_to_a_strong_one():
    ids = [item["id"] for item in search_faq("customer", "closed checkout page before paying")]

    assert ids[0] == "CUST-PAY-006"
    assert "CUST-DIS-003" not in ids
