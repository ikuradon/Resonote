# PROJECT KNOWLEDGE BASE

**Generated:** 2026-04-19
**Commit:** 011ee53
**Branch:** feat/auftakt

## OVERVIEW

Resonote = SvelteKit SPA + Cloudflare Pages + Hono API + Nostr comment/runtime system. Root guidance is supplemented by `CLAUDE.md`; child `AGENTS.md` files hold sharper local rules.

## STRUCTURE

```text
./
├── src/          # app/features/shared/server/web runtime
├── packages/     # Auftakt workspace packages
├── e2e/          # Playwright flows + mocked Nostr environment
├── scripts/      # migration / graph / proof utilities
├── docs/         # roadmap, specs, archives
└── CLAUDE.md     # full project canon
```

## WHERE TO LOOK

| Task                               | Location                        | Notes                                                          |
| ---------------------------------- | ------------------------------- | -------------------------------------------------------------- |
| Feature business logic             | `src/features/`                 | Slice architecture; child AGENTS under heavy slices            |
| Shared runtime / bridges           | `src/shared/`                   | Public boundary; child AGENTS for browser/nostr/content        |
| Presentational Svelte              | `src/lib/components/`           | Components only; no business ownership                         |
| Server routes / middleware         | `src/server/api/`               | Hono + Workers-safe fetch rules                                |
| Auftakt packages                   | `packages/`                     | `core` vocab, `timeline` planners, `resonote` facade, adapters |
| Browser E2E                        | `e2e/`                          | Mocked relays/auth; preview on :4173                           |
| Migration proof / structure guards | `scripts/`, `src/architecture/` | CI-enforced architecture checks                                |

## CODE MAP

| Symbol                           | Type     | Location                                                    | Role                              |
| -------------------------------- | -------- | ----------------------------------------------------------- | --------------------------------- |
| `runtime`                        | constant | `src/shared/auftakt/resonote.ts`                            | app-facing runtime facade         |
| `cachedFetchById`                | function | `src/shared/auftakt/resonote.ts`                            | canonical by-id read entry        |
| `useCachedLatest`                | function | `src/shared/auftakt/resonote.ts`                            | canonical latest-event read entry |
| `startCommentSubscription`       | function | `src/features/comments/application/comment-subscription.ts` | comments stream orchestrator      |
| `startMergedCommentSubscription` | function | `src/features/comments/application/comment-subscription.ts` | comments + extra tags merge       |
| `buildCommentContentFilters`     | function | `packages/resonote/src/runtime.ts`                          | comments event filter builder     |
| `observeRelayStatuses`           | function | `packages/resonote/src/runtime.ts`                          | relay status exposure             |

## CONVENTIONS

- Svelte 5 runes. Stateful ownership lives in `src/shared/browser/*.svelte.ts` or feature UI modules, not central stores.
- Path aliases are mandatory: `$shared`, `$features`, `$appcore`, `$server`. Relative climbs into those zones are lint violations.
- Workspace packages are private but treated as public internal APIs via `exports: { ".": "./src/index.ts" }`.
- Package contract tests live beside package sources (`packages/*/src/*.contract.test.ts`); root Vitest includes `packages/**/*.test.ts`.
- `src/web/routes` is the real SvelteKit routes tree; `src/routes` is not the canonical location.

## ANTI-PATTERNS (THIS PROJECT)

- Do not import internal `*.svelte.ts` bridges directly from outside their public wrapper.
- Do not put new runtime ownership in `src/lib/`; only presentational / component-local helpers belong there.
- Do not use bare `fetch()` in `src/server/`; use `safeFetch()`.
- Do not reintroduce `src/lib/stores/` or cross-feature infra/ui imports.
- Do not bypass migration proof: `pnpm run check:auftakt-migration -- --proof` is the completion gate for Auftakt work.

## UNIQUE STYLES

- Comments/Nostr flows are local-first and relay-aware; `ReadSettlement`, reconcile reason/state, and relay observation are first-class vocabulary.
- Content providers are file-per-platform under `src/shared/content/`; provider parsing rules are paired with same-named tests.
- E2E uses mocked relays (`.test` TLD) and mocked auth via tsunagiya helpers; real relay access is treated as a bug.

## COMMANDS

```bash
pnpm run dev
pnpm run dev:full
pnpm run build
pnpm run preview
pnpm run lint
pnpm run format:check
pnpm run check
pnpm run test
pnpm run test:packages
pnpm run test:e2e
pnpm run check:structure
pnpm run check:auftakt-migration -- --proof
```

## NOTES

- Depth/size justify child guides at `packages/`, `src/shared/`, `src/features/`, `src/server/api/`, `src/lib/components/`, and `e2e/`.
- Generated/build caches (`.svelte-kit/`, `build/`, `.wrangler/`, `dist-extension/`) are noisy; treat source directories as truth.
- `README.md` is onboarding-grade; `CLAUDE.md` is policy-grade; child AGENTS should capture only local deltas.
