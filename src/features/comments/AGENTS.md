# FEATURES / COMMENTS

## OVERVIEW

Most complex slice in the repo: subscriptions, merge/reconcile, deletion visibility, orphan parents, reactions, and heavy UI state.

## WHERE TO LOOK

- `application/comment-subscription.ts` — canonical comment stream façade
- `domain/deletion-rules.ts` — deletion target/reconcile helpers
- `infra/comment-repository.ts` — persistence/materialization
- `ui/comment-view-model.svelte.ts` — main hotspot
- `ui/comment-list-view-model.svelte.ts` — large list orchestration

## CONVENTIONS

- Runtime reads go through the Auftakt façade, not direct low-level Nostr imports.
- Deletion/reconcile semantics are centralized; avoid duplicate UI-only state inference.
- Orphan parent fetch + placeholders are legitimate UI concerns, but must consume canonical contracts.

## ANTI-PATTERNS

- No direct `$shared/nostr/gateway.js` imports or retired cached read bridge imports.
- No business logic moved back into `CommentCard`/`CommentList` helpers.
- No second copy of delete/reaction state mapping outside domain/timeline logic.
