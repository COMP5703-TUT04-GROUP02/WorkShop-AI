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
_WORD = re.compile(r"[a-z0-9]+")
_STOPWORDS = frozenset(
    "a an and are be can do does for how i if in is it my of on or the to what "
    "when where why will with you your".split()
)


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


def _stem(word: str) -> str:
    # Just enough to match "fails"/"failed" and "cancel"/"cancelled"; not a
    # real stemmer.
    for suffix in ("ing", "ed", "es", "s"):
        if word.endswith(suffix) and len(word) - len(suffix) >= 3:
            word = word[: -len(suffix)]
            break
    word = word.rstrip("e") or word
    if len(word) > 3 and word[-1] == word[-2]:
        word = word[:-1]
    return word


def _terms(text: str) -> set[str]:
    return {
        _stem(word)
        for word in _WORD.findall(text.lower())
        if word not in _STOPWORDS
    }


def search_faq(audience: str, query: str, limit: int = 3) -> list[dict]:
    """Rank entries by shared words, counting a match in the question 3x.

    Weak matches (under half the best score) are left out.
    """
    query_terms = _terms(query)
    if not query_terms:
        return []

    scored = []
    for category in get_faq(audience):
        for item in category["items"]:
            score = 3 * len(query_terms & _terms(item["question"])) + len(
                query_terms & _terms(item["answer"])
            )
            if score:
                scored.append((score, {**item, "category": category["title"]}))

    if not scored:
        return []
    scored.sort(key=lambda pair: pair[0], reverse=True)
    # One shared filler word ("before", "page") should not drag in an unrelated
    # answer next to a strong match.
    floor = scored[0][0] / 2
    return [item for score, item in scored[:limit] if score >= floor]
