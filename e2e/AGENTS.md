# E2E SUITE

## OVERVIEW

Playwright end-to-end suite for user-visible regressions. Runs against built preview on `http://localhost:4173` with mocked relays/auth.

## WHERE TO LOOK

- `helpers/e2e-setup.ts` — browser/bootstrap wiring
- `helpers/test-relays.ts` — relay URLs injected into build
- Flow files: `comment-flow.test.ts`, `notifications-page.test.ts`, `nip19-routes.test.ts`, `relay-settings-data.test.ts`, `settings-flow.test.ts`, etc.

## CONVENTIONS

- Use the shared setup helpers; do not hand-roll mock relay/auth bootstraps per test.
- Relay URLs use `.test` TLD and mocked tsunagiya bundle only.
- Prefer deterministic UI assertions over timing guesses; keep retries/timeouts aligned with config.

## ANTI-PATTERNS

- No real relay/network dependency.
- No bypassing preview build step assumptions (`playwright.config.ts` owns them).
- No new test that depends on local mutable state without resetting via helpers.
