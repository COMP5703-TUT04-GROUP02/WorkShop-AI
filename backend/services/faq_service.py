"""Help-centre FAQ loaded from the Markdown files in backend/content/faq.

Each audience has one Markdown file. The file is the single source of truth:
product edits it, the app reads it through GET /faq, and nothing is copied
into the frontend.
"""

import re
from functools import lru_cache
from pathlib import Path

FAQ_DIR = Path(__file__).resolve().parent.parent / "content" / "faq"
FAQ_AUDIENCES = ("customer",)

_CATEGORY = re.compile(r"^## (?P<title>.+?)\s*$")
_ENTRY_ID = re.compile(r"^### (?P<id>[A-Z]+-[A-Z]+-\d{3})\s*$")
_QUESTION = re.compile(r"^\*\*Question:\s*(?P<text>.+?)\*\*\s*$")
_ANSWER = re.compile(r"^\*\*Answer:\*\*\s*(?P<text>.+?)\s*$")


class FaqFormatError(ValueError):
    pass


def parse_faq(markdown: str) -> list[dict]:
    """Return categories in file order, each with its entries in file order."""
    categories: list[dict] = []
    entry: dict | None = None
    seen_ids: set[str] = set()

    def finish_entry():
        if entry is None:
            return
        if not entry["question"] or not entry["answer"]:
            raise FaqFormatError(f"{entry['id']} needs both a question and an answer")
        categories[-1]["items"].append(entry)

    for line_number, line in enumerate(markdown.splitlines(), start=1):
        if match := _CATEGORY.match(line):
            finish_entry()
            entry = None
            categories.append({"title": match["title"], "items": []})
        elif match := _ENTRY_ID.match(line):
            finish_entry()
            if not categories:
                raise FaqFormatError(f"line {line_number}: entry before any category")
            faq_id = match["id"]
            if faq_id in seen_ids:
                raise FaqFormatError(f"line {line_number}: duplicate id {faq_id}")
            seen_ids.add(faq_id)
            entry = {"id": faq_id, "question": "", "answer": ""}
        elif entry is not None and (match := _QUESTION.match(line)):
            entry["question"] = match["text"]
        elif entry is not None and (match := _ANSWER.match(line)):
            entry["answer"] = match["text"]

    finish_entry()

    for category in categories:
        if not category["items"]:
            raise FaqFormatError(f"category {category['title']!r} has no entries")
    return categories


@lru_cache(maxsize=len(FAQ_AUDIENCES))
def get_faq(audience: str) -> list[dict]:
    if audience not in FAQ_AUDIENCES:
        raise KeyError(audience)
    return parse_faq((FAQ_DIR / f"{audience}.md").read_text(encoding="utf-8"))
