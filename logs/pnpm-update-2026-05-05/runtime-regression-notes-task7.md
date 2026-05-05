# Task 7 Runtime Regression Notes

- Focus:
  - route/middleware/error shape (Hono)
  - optional/default/catch/preprocess/transform behavior (Zod)
  - login flow / publish path (@konemono/nostr-login)
  - encoding golden-vector risk (@scure/base)

- Verification status (final):
  - `pnpm run test:packages`: PASS
  - `pnpm run test:auftakt:app-regression`: PASS
  - `pnpm run check`: PASS

- Execution evidence:
  - Canonical run log: `logs/pnpm-update-2026-05-05/install-runtime.log`
  - Top-level resolution: `logs/pnpm-update-2026-05-05/pnpm-list-depth-0-runtime.txt`

- Notes on retries:
  - Earlier attempts had network (`EAI_AGAIN`) and transient module-resolution failures.
  - Final canonical evidence blocks show all required Task 7 gates passing.

- Residual risk:
  - Low. Runtime dependency updates are validated by package/app regression tests and type check.
  - Environment-level network instability may still affect future installs, but current dependency resolution and verify gates are green.
