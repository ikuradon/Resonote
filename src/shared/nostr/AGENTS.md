# SHARED NOSTR

## OVERVIEW

Nostr compatibility/helpers zone. Mix of helper modules, runtime bridges, and retirement-target shims. Treat this directory as sensitive during migrations.

## WHERE TO LOOK

- Compatibility façade: `gateway.ts`
- Read helpers: `cached-query.svelte.ts`, `cached-query.ts`, `query.ts`
- Runtime client: `client.ts`, `relays-config.ts`, `user-relays.ts`
- Event/data helpers: `events.ts`, `event-db.ts`, `content-link.ts`, `nip19-decode.ts`

## CONVENTIONS

- `gateway.ts` is compatibility-only and subtract-only.
- `cached-query.ts`, `user-relays.ts`, `gateway.ts` are retirement candidates; prefer app-facing access through `src/shared/auftakt/resonote.ts`.
- Canonical read semantics are `ReadSettlement`-driven; avoid reintroducing ad-hoc flags in new surfaces.

## ANTI-PATTERNS

- Feature/browser code should not import low-level Nostr helpers directly when a façade exists.
- Do not add fresh public entry points here just to avoid touching the façade.
- Do not mix transport concerns with content/provider rules.
