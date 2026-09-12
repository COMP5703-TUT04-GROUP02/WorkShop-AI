# Contributing

GitHub Actions CI is not a substitute for the local checks below. Run the ones that match what you changed before you open a pull request.

Work is tracked in Jira (`WS-<number>`). Put the key in the branch name and on the pull request.

## Branches

- `main` is the integration branch. **Do not push to `main`.**
- Implementation branches: `<usyd-unikey>/WS-<num>-short-slug`  
  The slash is part of the name; GitHub shows it as a folder.
- If a change has no Jira item yet, omit the key: `<usyd-unikey>/short-slug`.

```bash
git checkout main
git pull
git checkout -b xhua0028/WS-23-auth-api
```

Rename an existing local branch:

```bash
git branch -m old-name xhua0028/WS-23-auth-api
```

Examples:

| Branch | Use |
| ------ | --- |
| `xhua0028/WS-23-auth-api` | Aiden, WS-23 |
| `xhua0028/llm-vendors-and-auth` | No Jira item yet |

## Commits and pull request titles

Format (same for commits and PR titles; **not** the branch name):

```text
WS-<num> <type>: <brief description>
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`.

Example: `WS-23 feat: add RS256 JWT sessions`

- If a change has no Jira item yet, omit the key: `<type>: <brief description>`.

- Commit under **your own** GitHub account.
- Prefer the GitHub noreply email so Insights attributes the commit to you.

## Pull requests

- Open a PR into `main`. Use `.github/PULL_REQUEST_TEMPLATE.md`.
- Fill `WS-<number> <work item name>`. Use `N/A` only when there is no Jira item.
- Nested **If** checkboxes apply only when that kind of change is in the PR. Leave them unchecked when they do not apply.
- At least **one reviewer** when another maintainer is available.
- **Only repository maintainers** may merge into `main`. Nobody else merges, even if checks are green.
- Keep the PR focused. Do not mix unrelated refactors with a bug fix.

## Tests and schema (before merge)

Complete the checks that match what you changed:

| Change | Check |
| ------ | ----- |
| Backend API or business logic (`backend/`) | `pytest`; `ruff check backend tests` |
| Expo / TypeScript (`frontend/mobile/`) | `cd frontend/mobile && npm run typecheck` |
| Database models / schema | **New** Alembic revision. Never edit an applied revision |
| Business logic | Add or update the relevant automated tests |

Do not commit `.env` files, JWT keys under `backend/certs/`, or upload artifacts.

CI runs Alembic against PostgreSQL 16, Ruff (syntax and undefined-name checks), pytest, and the Expo TypeScript check. Treat those GitHub checks as required once they appear on the PR.
