# PACKAGES WORKSPACE

## OVERVIEW

`packages/` holds private internal packages for Auftakt contracts, planners, runtime facades, and adapters.

## WHERE TO LOOK

| Package              | Role                    | Notes                                       |
| -------------------- | ----------------------- | ------------------------------------------- |
| `core/`              | vocabulary only         | types, enums, contract tests                |
| `timeline/`          | planners/reducers       | requestKey, settlement, reconcile decisions |
| `resonote/`          | app-facing runtime      | high-level reads/subscriptions              |
| `adapter-relay/`     | relay transport/session | request replay + connection state           |
| `adapter-indexeddb/` | storage/materializer    | IndexedDB apply + reconcile materialization |

## CONVENTIONS

- Every package exports only `./src/index.ts`.
- Public API locks live in `src/public-api.contract.test.ts` or sibling contract tests.
- Root Vitest runs `packages/**/*.test.ts`; keep package tests self-contained.
- Child package guides own the package-specific rules; keep this file about workspace-wide boundaries only.

## ANTI-PATTERNS

- Do not import package internals via deep paths from app code.
- Do not move app/feature business logic into packages unless it is genuinely shared runtime logic.
- Do not let adapters invent vocabulary that belongs in `@auftakt/core` or `@auftakt/core`.
