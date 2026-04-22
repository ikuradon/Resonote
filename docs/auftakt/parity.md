# Auftakt Façade Parity Audit

## 1. Value Exports Inventory

| Export Name                      | Status                     | Spec §6 | Importer Context                         | Disposition |
| :------------------------------- | :------------------------- | :------ | :--------------------------------------- | :---------- |
| `publishSignedEvent`             | `documented`               | Yes     | -                                        | -           |
| `readLatestEvent`                | `documented`               | Yes     | -                                        | -           |
| `cachedFetchById`                | `documented`               | Yes     | -                                        | -           |
| `invalidateFetchByIdCache`       | `documented`               | Yes     | -                                        | -           |
| `useCachedLatest`                | `documented`               | Yes     | -                                        | -           |
| `openEventsDb`                   | `documented`               | Yes     | -                                        | -           |
| `setPreferredRelays`             | `documented`               | Yes     | -                                        | -           |
| `retryQueuedPublishes`           | `documented`               | Yes     | -                                        | -           |
| `publishSignedEvents`            | `documented`               | Yes     | -                                        | -           |
| `verifySignedEvent`              | `documented`               | Yes     | -                                        | -           |
| `fetchProfileCommentEvents`      | `documented`               | Yes     | -                                        | -           |
| `fetchFollowListSnapshot`        | `documented`               | Yes     | -                                        | -           |
| `fetchProfileMetadataEvents`     | `documented`               | Yes     | -                                        | -           |
| `fetchCustomEmojiSources`        | `documented`               | Yes     | -                                        | -           |
| `fetchCustomEmojiCategories`     | `documented`               | Yes     | -                                        | -           |
| `searchBookmarkDTagEvent`        | `documented`               | Yes     | -                                        | -           |
| `searchEpisodeBookmarkByGuid`    | `documented`               | Yes     | -                                        | -           |
| `fetchNostrEventById`            | `documented`               | Yes     | -                                        | -           |
| `loadCommentSubscriptionDeps`    | `documented`               | Yes     | -                                        | -           |
| `buildCommentContentFilters`     | `documented`               | Yes     | -                                        | -           |
| `startCommentSubscription`       | `documented`               | Yes     | -                                        | -           |
| `startMergedCommentSubscription` | `documented`               | Yes     | -                                        | -           |
| `startCommentDeletionReconcile`  | `documented`               | Yes     | -                                        | -           |
| `fetchWot`                       | `documented`               | Yes     | -                                        | -           |
| `subscribeNotificationStreams`   | `documented`               | Yes     | -                                        | -           |
| `snapshotRelayStatuses`          | `documented`               | Yes     | -                                        | -           |
| `observeRelayStatuses`           | `documented`               | Yes     | -                                        | -           |
| `fetchRelayListEvents`           | `documented`               | Yes     | -                                        | -           |
| `parseCommentContent`            | `undocumented-but-allowed` | No      | `CommentCard.svelte`                     | `allowlist` |
| `addEmojiTag`                    | `undocumented-but-allowed` | No      | `NoteInput.svelte`                       | `allowlist` |
| `extractShortcode`               | `undocumented-but-allowed` | No      | `NoteInput.svelte`, `EmojiPicker.svelte` | `allowlist` |

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
| `SubscriptionHandle`      | `supporting-only`       | No      | Return type for subscription starters                  |
| `UseCachedLatestResult`   | `documented in spec §6` | Yes     | Return type for `useCachedLatest`                      |

## 3. Missing Surfaces

- **Spec §6 Documented APIs missing from code**: None. All 28 APIs are present in `src/shared/auftakt/resonote.ts`.
- **Code Exports missing from Spec §6**:
  - `parseCommentContent` (Value)
  - `addEmojiTag` (Value)
  - `extractShortcode` (Value)
  - Supporting types (listed above)

## 4. Audit Summary

Façade `src/shared/auftakt/resonote.ts` は Spec §6 で定義されたすべての API を網羅している。
一方で、UI コンポーネントで直接利用されるパース・ユーティリティ系の関数 (`parseCommentContent`, `addEmojiTag`, `extractShortcode`) がドキュメント化されずに露出している。これらは Auftakt ランタイムのコア責務ではないが、Façade を通じて提供されているため、`allowlist` として分類し、将来的な Spec への追加またはユーティリティ層への分離を検討すべきである。
タイプエクスポートについては、主要な結果型はドキュメント化されているが、引数や内部的な型定義は「Supporting-only」として露出している。
