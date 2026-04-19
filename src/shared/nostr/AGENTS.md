# SHARED NOSTR

## OVERVIEW

Nostr helper/bridge zone. Runtime adapter modules と、まだ retire-ready 状態で残っている thin alias を含む。境界変更時は proof と ownership の整合を必ず保つ。

## WHERE TO LOOK

- Read helpers: `cached-query.svelte.ts`, `cached-query.ts`, `query.ts`
- Runtime client: `client.ts`, `relays-config.ts`, `user-relays.ts`
- Event/data helpers: `events.ts`, `event-db.ts`, `content-link.ts`, `nip19-decode.ts`

## CONVENTIONS

- `gateway.ts` is retired. Do not reintroduce it.
- `cached-query.ts` and `user-relays.ts` are legacy aliases only; prefer app-facing access through `src/shared/auftakt/resonote.ts` or the direct bridge they alias.
- `user-relays.test.ts` is the only intentional test-only legacy alias coverage left in this directory.
- Canonical read semantics are `ReadSettlement`-driven; avoid reintroducing ad-hoc flags in new surfaces.

## ANTI-PATTERNS

- Feature/browser code should not import low-level Nostr helpers directly when a façade exists.
- Do not add new references to retired `gateway.ts` or its former `$shared/nostr/gateway.js` path.
- Do not add fresh public entry points here just to avoid touching the façade.
- Do not mix transport concerns with content/provider rules.
