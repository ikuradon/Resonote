# SHARED RUNTIME BOUNDARY

## OVERVIEW

`src/shared/` is the public cross-feature runtime boundary: browser bridges, Nostr façades, content/provider contracts, i18n, utils.

## WHERE TO LOOK

| Area       | Purpose                          |
| ---------- | -------------------------------- |
| `browser/` | stateful browser/runtime bridges |
| `nostr/`   | Nostr interop + helpers          |
| `content/` | provider parsing/resolution      |
| `auftakt/` | app-facing Auftakt façade        |
| `i18n/`    | translation runtime public API   |

## CONVENTIONS

- Shared code is reusable across feature slices; if it is feature-specific, it does not belong here.
- Public wrappers live here; internal `*.svelte.ts` files are not for arbitrary import.
- Alias-first imports (`$shared/...`) are standard.

## ANTI-PATTERNS

- No feature business rules hiding in `shared/`.
- No new app-specific state in `lib/` as a shortcut around shared ownership.
- Do not bypass child guides for `browser/`, `nostr/`, or `content/`.
