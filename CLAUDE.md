# Resonote

Nostr プロトコルを使ったメディアコメント同期システム（Spotify, YouTube, Netflix 等 11 プラットフォーム対応）。
NIP-73 (External Content IDs) + NIP-22 (Comments, kind:1111) + NIP-25 (Reactions, kind:7) を活用。

## Commands

```bash
pnpm run dev          # dev server (http://localhost:5173)
pnpm run build        # production build → build/
pnpm run preview      # preview production build
pnpm run check        # svelte-kit sync + svelte-check
pnpm run lint         # ESLint
pnpm run format:check # Prettier format check
pnpm run format       # Prettier auto-format
pnpm run test         # unit tests (vitest)
pnpm run test:coverage # unit tests with coverage
pnpm run test:e2e     # E2E tests (Playwright)
pnpm run lint:fix     # ESLint auto-fix
pnpm run build:ext:chrome  # build extension for Chrome → dist-extension/
pnpm run build:ext:firefox # build extension for Firefox → dist-extension/
```

## Pre-commit Validation

**MUST** run all four checks before every commit/amend:

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test
```

This matches the CI pipeline order. Do not skip `pnpm lint` — `pnpm check` (svelte-check) only covers types, not ESLint rules like `no-unused-vars`, `no-undef`, or `svelte/require-each-key`.

## Tech Stack

- **Framework**: SvelteKit (SPA mode, Svelte 5 runes)
- **Adapter**: @sveltejs/adapter-static (`fallback: 'index.html'`)
- **Styling**: Tailwind CSS v4 (`@tailwindcss/vite` plugin)
- **Nostr**: rx-nostr + @rx-nostr/crypto (verifier/signer)
- **Auth**: @konemono/nostr-login (`init()` + `nlAuth` DOM event)
- **NIP utils**: nostr-tools (nip19 subpath only)
- **Package manager**: pnpm

## Code Style

- Indent: 2 spaces
- Single quotes in TS/JS unless interpolating
- `const` over `let`, no `var`
- Svelte 5 runes (`$state`, `$derived`, `$effect`, `$props`)
- File extensions in imports: `.js` (even for `.ts` files, per SvelteKit convention)
- `.svelte.ts` suffix for files using Svelte runes outside components

## Architecture

### Directory Structure

- `src/lib/` — Shared code ($lib alias): ContentProviders, Nostr layer, stores, components
- `src/web/` — SvelteKit entry points (routes, app.html, app.css)
- `src/extension/` — Browser extension (Chrome/Firefox Manifest V3)

### ContentProvider Pattern

`src/lib/content/types.ts` defines `ContentProvider` interface and `ContentId` type.
Each platform implements this interface. Extension-only providers set `requiresExtension: true`.
Nostr tags are generated via `toNostrTag()` returning NIP-73 `["I", ...]` tags.
Supported: Spotify, YouTube, Netflix, Prime Video, Disney+, Apple Music, SoundCloud, Fountain.fm, AbemaTV, TVer, U-NEXT

### Nostr Layer

- `src/lib/nostr/client.ts`: Singleton `getRxNostr()` with `@rx-nostr/crypto` verifier
- `src/lib/nostr/events.ts`: Event builders for kind:1111 (comment) and kind:7 (reaction)
- `src/lib/nostr/event-db.ts`: IndexedDB-based event cache (`idb` wrapper)
- `src/lib/nostr/relays.ts`: Default relay list
- `src/lib/nostr/user-relays.ts`: Per-user relay discovery
- Signing: `nip07Signer()` from rx-nostr (delegates to `window.nostr`)

### Subscription Pattern

Comments use rx-nostr's dual-request pattern:

- **Backward**: Fetch past events, call `over()` on completion
- **Forward**: Real-time subscription for new events
- Merged with `uniq()` + `timeline()` operators

### State Management

Svelte 5 `$state` runes in `src/lib/stores/*.svelte.ts` (no Svelte stores):

- `auth.svelte.ts`: Login state via nostr-login `nlAuth` events
- `comments.svelte.ts`: Per-content comment subscription
- `player.svelte.ts`: Playback state
- `profile.svelte.ts`: User profile (kind:0) cache
- `follows.svelte.ts`: Follow list (kind:3) state
- `relays.svelte.ts`: Relay connection status
- `emoji-sets.svelte.ts`: Custom emoji set management
- `extension.svelte.ts`: Browser extension mode state + postMessage listener

## Deployment

- **Hosting**: Cloudflare Pages (wrangler CLI)
- **CI**: GitHub Actions (`ci.yml`) — lint-and-check + audit + test + e2e + build-extension (parallel) → deploy
- **Deploy trigger**: Push to `main` → staging, `v*` tag → production

## Key Decisions

- SPA mode (`ssr = false`, `prerender = false`) — Nostr requires client-side WebSocket
- `fallback: 'index.html'` enables client-side routing for direct URL access
- `kit.files.routes = 'src/web/routes'`, `kit.files.appTemplate = 'src/web/app.html'` — Web/Extension directory separation
- `noBanner: true` in nostr-login init — manual login UI via `launch()`
- rx-nostr verifier is mandatory; using `@rx-nostr/crypto`'s `verifier`
