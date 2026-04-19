# LIB COMPONENTS

## OVERVIEW

Presentational Svelte components and component-local presentation helpers only.

## WHERE TO LOOK

- Comment UI: `CommentCard.svelte`, `CommentActionMenu.svelte`, `CommentList.svelte`
- Embed UI: `SpotifyEmbed.svelte`, `YouTubeEmbed.svelte`, `AudioEmbed.svelte`, etc.
- Shared widgets: `RelayStatus.svelte`, `NotificationBell.svelte`, `VirtualScrollList.svelte`
- Local helpers: `audio-embed-view-model.svelte.ts`, `emoji-popover-id.ts`

## CONVENTIONS

- Component-local helpers are okay if they do not own business/runtime state.
- Repeated display rules should move to `$shared` or the owning feature helper.
- Visual regressions here are mostly guarded by E2E + focused component helper tests.

## ANTI-PATTERNS

- No direct infra or storage imports.
- No new runtime ownership.
- No hidden feature orchestration inside presentation components.
