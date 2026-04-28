# Auftakt Façade Parity Audit

## 1. Value Exports Inventory

| Export Name                      | Status                     | Spec §6 | Importer Context                            | Disposition |
| :------------------------------- | :------------------------- | :------ | :------------------------------------------ | :---------- |
| `publishSignedEvent`             | `documented`               | Yes     | -                                           | -           |
| `readLatestEvent`                | `documented`               | Yes     | -                                           | -           |
| `cachedFetchById`                | `documented`               | Yes     | -                                           | -           |
| `invalidateFetchByIdCache`       | `documented`               | Yes     | -                                           | -           |
| `useCachedLatest`                | `documented`               | Yes     | -                                           | -           |
| `setPreferredRelays`             | `documented`               | Yes     | -                                           | -           |
| `retryQueuedPublishes`           | `documented`               | Yes     | -                                           | -           |
| `publishSignedEvents`            | `documented`               | Yes     | -                                           | -           |
| `verifySignedEvent`              | `documented`               | Yes     | -                                           | -           |
| `fetchProfileCommentEvents`      | `documented`               | Yes     | -                                           | -           |
| `fetchFollowListSnapshot`        | `documented`               | Yes     | -                                           | -           |
| `fetchProfileMetadataEvents`     | `documented`               | Yes     | -                                           | -           |
| `fetchProfileMetadataSources`    | `undocumented-but-allowed` | No      | `profile.svelte.ts fallback absorption`     | `allowlist` |
| `fetchCustomEmojiSources`        | `documented`               | Yes     | -                                           | -           |
| `fetchCustomEmojiCategories`     | `documented`               | Yes     | -                                           | -           |
| `searchBookmarkDTagEvent`        | `documented`               | Yes     | -                                           | -           |
| `searchEpisodeBookmarkByGuid`    | `documented`               | Yes     | -                                           | -           |
| `fetchNostrEventById`            | `documented`               | Yes     | -                                           | -           |
| `fetchBackwardEvents`            | `documented`               | Yes     | -                                           | -           |
| `fetchBackwardFirst`             | `documented`               | Yes     | -                                           | -           |
| `fetchNotificationTargetPreview` | `undocumented-but-allowed` | No      | `notification-feed fallback absorption`     | `allowlist` |
| `loadCommentSubscriptionDeps`    | `documented`               | Yes     | -                                           | -           |
| `buildCommentContentFilters`     | `documented`               | Yes     | -                                           | -           |
| `startCommentSubscription`       | `documented`               | Yes     | -                                           | -           |
| `startMergedCommentSubscription` | `documented`               | Yes     | -                                           | -           |
| `startCommentDeletionReconcile`  | `documented`               | Yes     | -                                           | -           |
| `fetchWot`                       | `documented`               | Yes     | -                                           | -           |
| `subscribeNotificationStreams`   | `documented`               | Yes     | -                                           | -           |
| `snapshotRelayStatuses`          | `documented`               | Yes     | -                                           | -           |
| `observeRelayStatuses`           | `documented`               | Yes     | -                                           | -           |
| `snapshotRelayCapabilities`      | `documented`               | Yes     | -                                           | -           |
| `observeRelayCapabilities`       | `documented`               | Yes     | -                                           | -           |
| `fetchRelayListEvents`           | `documented`               | Yes     | -                                           | -           |
| `fetchRelayListSources`          | `undocumented-but-allowed` | No      | `relays.svelte.ts fallback absorption`      | `allowlist` |
| `clearStoredEvents`              | `undocumented-but-allowed` | No      | `coordinator-mediated storage maintenance`  | `allowlist` |
| `countStoredEventsByKinds`       | `undocumented-but-allowed` | No      | `coordinator-mediated storage stats`        | `allowlist` |
| `deleteCommentEventsByIds`       | `undocumented-but-allowed` | No      | `coordinator-mediated comment cache access` | `allowlist` |
| `readCommentEventsByTag`         | `undocumented-but-allowed` | No      | `coordinator-mediated comment cache access` | `allowlist` |
| `storeCommentEvent`              | `undocumented-but-allowed` | No      | `coordinator-mediated comment cache access` | `allowlist` |
| `readStoredFollowGraph`          | `undocumented-but-allowed` | No      | `coordinator-mediated follow graph access`  | `allowlist` |
| `registerPlugin`                 | `undocumented-but-allowed` | No      | `runtime plugin bootstrap`                  | `allowlist` |
| `parseCommentContent`            | `undocumented-but-allowed` | No      | `CommentCard.svelte`                        | `allowlist` |
| `addEmojiTag`                    | `undocumented-but-allowed` | No      | `NoteInput.svelte`                          | `allowlist` |
| `extractShortcode`               | `undocumented-but-allowed` | No      | `NoteInput.svelte`, `EmojiPicker.svelte`    | `allowlist` |

## 2. Type Exports Inventory

| Export Name               | Status                  | Spec §6 | Role                                                   |
| :------------------------ | :---------------------- | :------ | :----------------------------------------------------- |
| `StoredEvent`             | `supporting-only`       | No      | Used in `getEventsDB` return type                      |
| `WotResult`               | `documented in spec §6` | Yes     | Return type for `fetchWot`                             |
| `CachedFetchByIdResult`   | `documented in spec §6` | Yes     | Return type for `cachedFetchById`                      |
| `CommentFilterKinds`      | `supporting-only`       | No      | Parameter for `buildCommentContentFilters`             |
| `CommentSubscriptionRefs` | `supporting-only`       | No      | Return type for `loadCommentSubscriptionDeps`          |
| `DeletionEvent`           | `supporting-only`       | No      | Callback parameter for `startCommentDeletionReconcile` |
| `EmojiCategory`           | `documented in spec §6` | Yes     | Return type for `fetchCustomEmojiCategories`           |
| `RelayCapabilityPacket`   | `documented in spec §6` | Yes     | Packet type for `observeRelayCapabilities`             |
| `RelayCapabilitySnapshot` | `documented in spec §6` | Yes     | Return type for `snapshotRelayCapabilities`            |
| `SubscriptionHandle`      | `supporting-only`       | No      | Return type for subscription starters                  |
| `UseCachedLatestResult`   | `documented in spec §6` | Yes     | Return type for `useCachedLatest`                      |

## 3. Allowed Non-§6 Surfaces

- **Spec §6 Documented APIs missing from code**: None. All 31 APIs are present in `src/shared/auftakt/resonote.ts`.
- **Façade value exports intentionally outside Spec §6**:
  - `fetchProfileMetadataSources` (Value)
  - `fetchNotificationTargetPreview` (Value)
  - `fetchRelayListSources` (Value)
  - `clearStoredEvents` (Value)
  - `countStoredEventsByKinds` (Value)
  - `deleteCommentEventsByIds` (Value)
  - `readCommentEventsByTag` (Value)
  - `storeCommentEvent` (Value)
  - `readStoredFollowGraph` (Value)
  - `registerPlugin` (Value)
  - `parseCommentContent` (Value)
  - `addEmojiTag` (Value)
  - `extractShortcode` (Value)
  - Supporting types (listed above)

## 4. Audit Summary

Façade `src/shared/auftakt/resonote.ts` は Spec §6 で定義されたすべての API を網羅している。
一方で、fallback ownership を browser/view-model から引き上げるための補助 surface (`fetchProfileMetadataSources`, `fetchNotificationTargetPreview`, `fetchRelayListSources`) と、UI コンポーネントで直接利用されるパース・ユーティリティ系の関数 (`parseCommentContent`, `addEmojiTag`, `extractShortcode`) がドキュメント化されずに露出している。local storage helper は raw DB handle を返さず coordinator-owned high-level method に閉じる。これらは Spec §6 の正式 API に広げる前段として `allowlist` に留め、boundary cleanup の範囲を超えて公開面を拡大しない。
タイプエクスポートについては、主要な結果型はドキュメント化されているが、引数や内部的な型定義は「Supporting-only」として露出している。
