# Contributing

GitHub Actions CI is not a substitute for the local checks below. Run the ones that match what you changed before you open a pull request.

This repository does not use Jira. Track work in GitHub issues or pull requests.

## Branches

- `main` is the integration branch. **Do not push to `main`.**
- Implementation branches: `<usyd-unikey>/short-slug`  
  The slash is part of the name; GitHub shows it as a folder.

```bash
git checkout main
git pull
git checkout -b xhua0028/postgres-english-tests
```

Rename an existing local branch:

```bash
git branch -m old-name xhua0028/postgres-english-tests
```

Examples:

| Branch | Use |
| ------ | --- |
| `xhua0028/postgres-english-tests` | Postgres baseline and English copy |
| `xhua0028/fix-websocket-auth` | WebSocket auth payload |

## Commits and pull request titles

Format (same for commits and PR titles; **not** the branch name):

```text
<type>: <brief description>
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`.

Example: `feat: add RS256 JWT sessions`

- Commit under **your own** GitHub account.
- Prefer the GitHub noreply email so Insights attributes the commit to you.

## Pull requests

- Open a PR into `main`. Use `.github/PULL_REQUEST_TEMPLATE.md`.
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
