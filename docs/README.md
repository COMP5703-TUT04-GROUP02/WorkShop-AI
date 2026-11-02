# Workshop AI documentation

## Start here

- [Project overview and quick start](../README.md)
- [Deployment and credentials](deployment.md): required accounts, optional integrations, Docker/host configuration, persistence and review indexing.
- [API usage](api-usage.md): integration flows and source-derived route inventory. Use the running server's `/docs` for complete schemas.
- [Backend architecture](backend-feature-map.md): modules, account lifecycle, provider onboarding, payments and AI actions.
- [API conventions](backend-api-standard.md): response, permissions, uploads, WebSocket authentication and contributor checklist.
- [Contributing](../CONTRIBUTING.md): branches, pull requests and applicable checks.

## Supporting material

- [Reference-price design](superpowers/specs/2026-10-06-reference-price-range-design.md) documents the implemented calculation rules.
- `testing/` contains historical manual test evidence and capture scripts, not current acceptance guarantees. In particular, `ws-85-88` predates real email-code verification.
- `ui/` and `workshop-ai-functional-requirements/` contain design/reference material. They do not override the current implementation.

The retired sample-photo generation instructions and completed reference-price task checklist have been removed. The API guide replaces the stale manually maintained endpoint/schema snapshot with a source-derived route inventory; the live OpenAPI schema supplies field-level contracts.
