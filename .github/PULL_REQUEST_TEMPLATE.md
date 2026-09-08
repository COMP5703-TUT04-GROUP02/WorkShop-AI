## Jira work item(s)

WS-<number> <work item name>

## What changed?

-

## Checklist

- [ ] The PR title follows `<type>: <description>`.

### For Developers

Tick an **If** only when that kind of change is in the PR. Leave nested boxes unchecked when they do not apply.

- [ ] If backend code changed
  - [ ] I ran pytest, and all checks passed.
  - [ ] I ran `ruff check backend tests`.
- [ ] If Expo / mobile code changed
  - [ ] I ran `npm run typecheck`, and it passed.
- [ ] If database models or schema changed
  - [ ] I added a new Alembic revision (do not edit applied revisions).
- [ ] If business logic changed
  - [ ] I added or updated the relevant automated tests.
- [ ] I did not commit `.env` files, JWT keys, or upload artifacts.
