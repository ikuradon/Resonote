# SERVER API

## OVERVIEW

Hono app running under Cloudflare Pages/Workers. Routes are small, middleware-heavy, and must stay SSRF-safe.

## WHERE TO LOOK

- `app.ts` — route wiring
- `middleware/` — cache, rate-limit, error handling
- `podcast.ts`, `podbean.ts`, `oembed.ts`, `youtube.ts`, `system.ts` — main route files
- `bindings.ts` — env contract

## CONVENTIONS

- Bare `fetch()` is banned; use `safeFetch()`.
- Route validation and hostile-input handling belong close to the route.
- Middleware order matters: cache/rate-limit/error behavior should be explicit in `app.ts`.

## ANTI-PATTERNS

- No unvalidated external URL fetches.
- No secret handling in route code.
- No route additions without corresponding tests and `app.ts` registration.
