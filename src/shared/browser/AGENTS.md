# SHARED BROWSER

## OVERVIEW

Stateful browser bridges and UI-support ownership. This directory is flat but dense: each bridge pairs runtime state with a thin public wrapper.

## WHERE TO LOOK

- Auth/session: `auth.svelte.ts`, `auth.ts`
- Playback: `player.svelte.ts`, `playback-bridge.ts`, `seek-bridge.ts`
- Social state: `profile.svelte.ts`, `follows.svelte.ts`, `mute.svelte.ts`, `relays.svelte.ts`
- UX support: `toast.svelte.ts`, `locale.svelte.ts`, `emoji-sets.svelte.ts`, `extension.svelte.ts`

## CONVENTIONS

- `*.svelte.ts` owns reactive state; sibling `*.ts` file is the public import surface.
- Tests live alongside each bridge; keep bridge state deterministic/resettable.
- Shared browser modules may depend on `window`/DOM, but feature business decisions stay outside.

## ANTI-PATTERNS

- No direct imports of `*.svelte.ts` from arbitrary callers.
- No recreation of global stores elsewhere.
- No feature-specific orchestration here unless it is genuinely cross-feature UI support.
