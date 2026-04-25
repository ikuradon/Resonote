# SHARED NOSTR

## OVERVIEW

Nostr helper/bridge zone. Runtime adapter modules と、まだ retire-ready 状態で残っている thin alias を含む。境界変更時は proof と ownership の整合を必ず保つ。

## WHERE TO LOOK

- Read helpers: `query.ts`
- Runtime client: `client.ts`, `relays-config.ts`, `user-relays.ts`
- Event/data helpers: `events.ts`, `event-db.ts`, `content-link.ts`, `nip19-decode.ts`

## CONVENTIONS

- `gateway.ts` is retired. Do not reintroduce it.
- `user-relays.ts` is a legacy alias only; prefer app-facing access through `src/shared/auftakt/resonote.ts` or the direct bridge it aliases.
- `user-relays.test.ts` is the only intentional test-only legacy alias coverage left in this directory.
- Canonical read semantics are `ReadSettlement`-driven; avoid reintroducing ad-hoc flags in new surfaces.

## ANTI-PATTERNS

- Feature/browser code should not import low-level Nostr helpers directly when a façade exists.
- Do not add new references to retired `gateway.ts` or its former `$shared/nostr/gateway.js` path.
- Do not add fresh public entry points here just to avoid touching the façade.
- Do not mix transport concerns with content/provider rules.
