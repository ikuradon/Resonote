# PACKAGES WORKSPACE

## OVERVIEW

`packages/` holds private internal packages for Auftakt core runtime contracts, the Resonote runtime facade, and storage adapters.

## WHERE TO LOOK

| Package          | Role                                 | Notes                                                                     |
| ---------------- | ------------------------------------ | ------------------------------------------------------------------------- |
| `core/`          | Auftakt runtime foundation           | vocabulary, planning, relay session                                       |
| `resonote/`      | Resonote app-specific runtime facade | coordinator, plugins, feature-facing flows                                |
| `adapter-dexie/` | storage/materializer adapter         | Dexie schema, durable queries, pending publishes, quarantine, relay hints |

## CONVENTIONS

- Every package exports only `./src/index.ts`.
- Public API locks live in `src/public-api.contract.test.ts` or sibling contract tests.
- Root Vitest runs `packages/**/*.test.ts`; keep package tests self-contained.
- Child package guides own the package-specific rules; keep this file about workspace-wide boundaries only.

## ANTI-PATTERNS

- Do not import package internals via deep paths from app code.
- Do not move app/feature business logic into packages unless it is genuinely shared runtime logic.
- Do not let adapters invent vocabulary that belongs in `@auftakt/core`.
