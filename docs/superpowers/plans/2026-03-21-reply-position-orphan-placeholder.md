# リプライ position 継承 + 孤児親プレースホルダー 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** リプライ送信時に親の positionMs を継承し、孤児リプライの親をプレースホルダーとして表示する

**Architecture:** 3層で変更。domain 層に PlaceholderComment 型を追加、application 層で sendReply に positionMs を通し、UI 層で孤児親検出・fetch・プレースホルダー合成を行う。cachedFetchById を完全イベント形状に拡張して DB → リレーの2段フォールバックで親を取得する。

**Tech Stack:** SvelteKit (Svelte 5 runes), rx-nostr, IndexedDB (idb), vitest

**Issue:** https://github.com/ikuradon/Resonote/issues/104

---

## ファイル構成

| ファイル                                                     | 操作 | 責務                                                |
| ------------------------------------------------------------ | ---- | --------------------------------------------------- |
| `src/features/comments/domain/comment-model.ts`              | 変更 | `PlaceholderComment` 型追加                         |
| `src/features/comments/domain/comment-mappers.ts`            | 変更 | `placeholderFromOrphan` 関数追加                    |
| `src/features/comments/domain/comment-mappers.test.ts`       | 変更 | placeholderFromOrphan テスト追加                    |
| `src/features/comments/application/comment-actions.ts`       | 変更 | `SendReplyParams` に `positionMs` 追加              |
| `src/shared/nostr/cached-query.svelte.ts`                    | 変更 | `cachedFetchById` の返り値を完全イベント形状に拡張  |
| `src/features/comments/ui/comment-view-model.svelte.ts`      | 変更 | 孤児親 fetch + commentsRaw 合流 + placeholders 状態 |
| `src/features/comments/ui/comment-list-view-model.svelte.ts` | 変更 | submitReply に positionMs 渡す + orphan 検出        |
| `src/features/comments/ui/comment-list-view-model.test.ts`   | 変更 | positionMs テスト + orphan テスト追加               |
| `src/lib/components/CommentList.svelte`                      | 変更 | props 接続 + orphan プレースホルダー UI             |
| `src/shared/i18n/ja.json`                                    | 変更 | 3つのシステムメッセージ文言追加                     |
| `src/shared/i18n/en.json`                                    | 変更 | 3つのシステムメッセージ文言追加                     |

---

## Task 1: リプライ送信時の positionMs 継承

**Files:**

- Modify: `src/features/comments/application/comment-actions.ts`
- Modify: `src/features/comments/ui/comment-list-view-model.svelte.ts`
- Test: `src/features/comments/ui/comment-list-view-model.test.ts`

### Step 1.1: テスト追加 — submitReply が positionMs を渡すことを検証

- [ ] `comment-list-view-model.test.ts` に以下のテストを追加:

```ts
it('submitReply passes parent positionMs to sendReply', async () => {
  const vm = createCommentListViewModel(defaultOptions);
  const timedComment = createComment({
    id: 'timed-1',
    pubkey: 'other',
    content: 'timed',
    positionMs: 30_000
  });
  vm.startReply(timedComment);
  vm.replyContent = 'reply text';
  await vm.submitReply();
  expect(sendReplyMock).toHaveBeenCalledWith(expect.objectContaining({ positionMs: 30_000 }));
});

it('submitReply passes undefined positionMs for general comment reply', async () => {
  const vm = createCommentListViewModel(defaultOptions);
  const generalComment = createComment({
    id: 'gen-1',
    pubkey: 'other',
    content: 'general'
  });
  vm.startReply(generalComment);
  vm.replyContent = 'reply text';
  await vm.submitReply();
  expect(sendReplyMock).toHaveBeenCalledWith(expect.objectContaining({ positionMs: undefined }));
});
```

- [ ] **既存テスト修正**: 既存の `submitReply` テスト（完全一致アサーション）を `expect.objectContaining` に変更するか、期待値に `positionMs: undefined` を追加する。対象: `submitReply` の既存テスト全て。

- [ ] テスト実行して FAIL を確認: `pnpm test -- src/features/comments/ui/comment-list-view-model.test.ts`

### Step 1.2: SendReplyParams に positionMs 追加

- [ ] `comment-actions.ts` の `SendReplyParams` に追加:

```ts
export interface SendReplyParams {
  content: string;
  contentId: ContentId;
  provider: ContentProvider;
  parentEvent: { id: string; pubkey: string };
  emojiTags?: string[][];
  positionMs?: number; // ← 追加
}
```

- [ ] `sendReply()` で `buildComment` に `positionMs` を渡す:

```ts
export async function sendReply(params: SendReplyParams): Promise<void> {
  const eventParams = buildComment(params.content, params.contentId, params.provider, {
    emojiTags: params.emojiTags,
    parentEvent: params.parentEvent,
    positionMs: params.positionMs // ← 追加
  });
  // ...
}
```

注: `buildComment` は既に `positionMs` を `options?.positionMs` として受け取り、`position` タグを生成する。変更不要。

### Step 1.3: submitReply で replyTarget.positionMs を渡す

- [ ] `comment-list-view-model.svelte.ts` の `submitReply()` を変更:

```ts
await sendReplyAction({
  content: trimmed,
  contentId: options.getContentId(),
  provider: options.getProvider(),
  parentEvent: { id: replyTarget.id, pubkey: replyTarget.pubkey },
  emojiTags: tags,
  positionMs: replyTarget.positionMs ?? undefined // ← 追加
});
```

- [ ] テスト実行して PASS を確認: `pnpm test -- src/features/comments/ui/comment-list-view-model.test.ts`

### Step 1.4: コミット

- [ ] `git commit -m "feat: inherit parent positionMs when sending reply (#104)"`

---

## Task 2: PlaceholderComment ドメイン型

**Files:**

- Modify: `src/features/comments/domain/comment-model.ts`
- Modify: `src/features/comments/domain/comment-mappers.ts`
- Test: `src/features/comments/domain/comment-mappers.test.ts`

### Step 2.1: テスト追加 — placeholderFromOrphan

- [ ] `comment-mappers.test.ts` に追加:

```ts
import { placeholderFromOrphan } from './comment-mappers.js';

describe('placeholderFromOrphan', () => {
  it('creates loading placeholder with positionMs from orphan reply', () => {
    const result = placeholderFromOrphan('parent-id', 30_000);
    expect(result).toEqual({
      id: 'parent-id',
      status: 'loading',
      positionMs: 30_000
    });
  });

  it('creates loading placeholder with null positionMs', () => {
    const result = placeholderFromOrphan('parent-id', null);
    expect(result).toEqual({
      id: 'parent-id',
      status: 'loading',
      positionMs: null
    });
  });
});
```

- [ ] テスト実行して FAIL を確認

### Step 2.2: PlaceholderComment 型と placeholderFromOrphan 実装

- [ ] `comment-model.ts` に追加:

```ts
export interface PlaceholderComment {
  id: string;
  status: 'loading' | 'not-found' | 'deleted';
  positionMs: number | null;
}
```

- [ ] `comment-mappers.ts` に追加:

```ts
import type { PlaceholderComment } from './comment-model.js';

export function placeholderFromOrphan(
  parentId: string,
  positionMs: number | null
): PlaceholderComment {
  return { id: parentId, status: 'loading', positionMs };
}
```

- [ ] テスト実行して PASS を確認

### Step 2.3: コミット

- [ ] `git commit -m "feat: add PlaceholderComment domain type (#104)"`

---

## Task 3: cachedFetchById の返り値拡張

**Files:**

- Modify: `src/shared/nostr/cached-query.svelte.ts`

### Step 3.1: 既存呼び出し元の確認

- [ ] `grep -r 'cachedFetchById' src/` で全呼び出し元を確認
- [ ] 各呼び出し元が `result.content` / `result.kind` のみ使用していることを確認（superset のため後方互換）

### Step 3.2: 返り値型を拡張

- [ ] `cached-query.svelte.ts` の `cachedFetchById` 返り値型を変更:

```ts
// 旧: Promise<{ content: string; kind: number } | null>
// 新:
export interface FetchedEventFull {
  id: string;
  pubkey: string;
  content: string;
  created_at: number;
  tags: string[][];
  kind: number;
}

export async function cachedFetchById(eventId: string): Promise<FetchedEventFull | null>;
```

- [ ] 関数内部の `found` 変数と DB キャッシュ (`fetchByIdCache`) を完全形状に更新:

```ts
const fetchByIdCache = new Map<string, FetchedEventFull | null>();
```

- [ ] DB ヒット時: `db.getById(eventId)` の返り値をそのまま返す（既に完全形状）
- [ ] リレーヒット時: `packet.event` をそのまま `found` に格納（`{ content, kind }` への切り詰めを削除）

### Step 3.3: テスト実行 — 既存テスト + 型チェック

- [ ] `pnpm test` で全テストが PASS することを確認
- [ ] `pnpm check` で型エラーがないことを確認
- [ ] 呼び出し元で型エラーが出た場合は修正（result が superset なので通常不要）

### Step 3.4: コミット

- [ ] `git commit -m "feat: extend cachedFetchById to return full event shape (#104)"`

---

## Task 4: i18n メッセージ追加

**Files:**

- Modify: `src/shared/i18n/ja.json`
- Modify: `src/shared/i18n/en.json`

注: 既存の `comment.placeholder.*` キーはコメント入力フォームのプレースホルダーテキスト用。孤児コメント用は `comment.orphan.*` 名前空間を使用して衝突を避ける。

### Step 4.1: メッセージ追加

- [ ] `ja.json` に追加:

```json
"comment.orphan.loading": "取得中…",
"comment.orphan.not_found": "取得できませんでした",
"comment.orphan.deleted": "削除されました"
```

- [ ] `en.json` に追加:

```json
"comment.orphan.loading": "Loading…",
"comment.orphan.not_found": "Could not retrieve",
"comment.orphan.deleted": "Deleted"
```

### Step 4.2: コミット

- [ ] `git commit -m "feat: add i18n messages for orphan comment placeholders (#104)"`

---

## Task 5: 孤児親 fetch + プレースホルダー合成 (comment-view-model)

**Files:**

- Modify: `src/features/comments/ui/comment-view-model.svelte.ts`

注: `comment-view-model` はクロージャ内で `commentsRaw`, `commentIds`, `deletedIds`, `destroyed` 等のローカル変数にアクセスできる。`fetchOrphanParent` はこのクロージャ内に定義する。

### Step 5.1: 状態追加

- [ ] import 追加:

```ts
import type { PlaceholderComment } from '../domain/comment-model.js';
import { placeholderFromOrphan } from '../domain/comment-mappers.js';
import { cachedFetchById } from '$shared/nostr/cached-query.svelte.js';
```

- [ ] `createCommentViewModel` クロージャ内に状態追加:

```ts
let placeholders = $state<Map<string, PlaceholderComment>>(new Map());
let fetchedParentIds = new Set<string>();
```

### Step 5.2: fetchOrphanParent 関数

- [ ] `createCommentViewModel` クロージャ内に追加:

```ts
async function fetchOrphanParent(parentId: string, estimatedPositionMs: number | null) {
  if (fetchedParentIds.has(parentId) || commentIds.has(parentId)) return;
  fetchedParentIds.add(parentId);

  // プレースホルダーを loading で登録
  const next = new Map(placeholders);
  next.set(parentId, placeholderFromOrphan(parentId, estimatedPositionMs));
  placeholders = next;

  const result = await cachedFetchById(parentId);

  if (destroyed) return;

  if (result && result.kind === COMMENT_KIND) {
    // 取得成功 → commentsRaw に合流、プレースホルダー除去
    // commentFromEvent は NostrEvent 形状 (id, pubkey, content, created_at, tags) を要求
    // FetchedEventFull はこれを満たす superset
    if (!commentIds.has(result.id)) {
      commentIds.add(result.id);
      eventPubkeys.set(result.id, result.pubkey);
      commentsRaw = [...commentsRaw, commentFromEvent(result)];
    }
    const updated = new Map(placeholders);
    updated.delete(parentId);
    placeholders = updated;
  } else {
    // 取得失敗 or 非コメント kind
    // deletedIds は subscription 経由で更新されるため、fetch 時点で入っている場合のみ deleted 判定
    // fetch 後に kind:5 が到着して deletedIds に入った場合は、handleDeletionPacket 側で
    // placeholders を 'deleted' に更新する（Step 5.4 参照）
    const status = deletedIds.has(parentId) ? 'deleted' : 'not-found';
    const updated = new Map(placeholders);
    updated.set(parentId, { ...placeholders.get(parentId)!, status });
    placeholders = updated;
  }
}
```

### Step 5.3: handleDeletionPacket でプレースホルダーの deleted 更新

- [ ] `handleDeletionPacket` の末尾に追加（kind:5 が後から到着した場合のレース対応）:

```ts
// 孤児プレースホルダーが loading/not-found の場合、deleted に更新
for (const id of verified) {
  const ph = placeholders.get(id);
  if (ph && ph.status !== 'deleted') {
    const updated = new Map(placeholders);
    updated.set(id, { ...ph, status: 'deleted' });
    placeholders = updated;
  }
}
```

### Step 5.4: destroy() でプレースホルダー状態をクリア

- [ ] `destroy()` 関数に追加:

```ts
placeholders = new Map();
fetchedParentIds = new Set();
```

### Step 5.5: 公開 API に追加

- [ ] return オブジェクトに追加:

```ts
get placeholders() {
  return placeholders;
},
fetchOrphanParent,
```

### Step 5.6: テスト実行

注: `fetchOrphanParent` のユニットテストは `cachedFetchById` 内部で rx-nostr の動的 import + `$state` リアクティビティが絡むため単体での検証が困難。動作検証は Task 8 の手動テスト + E2E で担保する。ここでは既存テストの回帰確認と型チェックのみ行う。

- [ ] `pnpm test && pnpm check` で回帰なし・型エラーなしを確認

### Step 5.7: コミット

- [ ] `git commit -m "feat: add orphan parent fetch and placeholder state (#104)"`

---

## Task 6: comment-list-view-model で孤児検出 + props 接続

**Files:**

- Modify: `src/features/comments/ui/comment-list-view-model.svelte.ts`
- Test: `src/features/comments/ui/comment-list-view-model.test.ts`

### Step 6.1: テスト追加 — 孤児リプライの親検出

- [ ] `comment-list-view-model.test.ts` にテスト追加:

```ts
describe('orphan parent detection', () => {
  it('detects orphan replies whose parent is not in comments', () => {
    const orphanReply = createComment({
      id: 'reply-1',
      pubkey: 'me',
      content: 'orphan reply',
      replyTo: 'missing-parent',
      positionMs: 15_000
    });
    const opts = {
      ...defaultOptions,
      getComments: () => [orphanReply]
    };
    const vm = createCommentListViewModel(opts);
    expect(vm.orphanParentIds).toContain('missing-parent');
  });

  it('does not detect orphan when parent exists in comments', () => {
    const parent = createComment({
      id: 'parent-1',
      pubkey: 'me',
      content: 'parent',
      positionMs: 10_000
    });
    const reply = createComment({
      id: 'reply-1',
      pubkey: 'me',
      content: 'reply',
      replyTo: 'parent-1'
    });
    const opts = {
      ...defaultOptions,
      getComments: () => [parent, reply]
    };
    const vm = createCommentListViewModel(opts);
    expect(vm.orphanParentIds).toHaveLength(0);
  });
});
```

- [ ] テスト実行して FAIL を確認

### Step 6.2: options に placeholders と fetchOrphanParent を追加

- [ ] `CommentListViewModelOptions` に追加:

```ts
import type { PlaceholderComment } from '../domain/comment-model.js';

interface CommentListViewModelOptions {
  // 既存...
  getPlaceholders?: () => Map<string, PlaceholderComment>;
  fetchOrphanParent?: (parentId: string, positionMs: number | null) => void;
}
```

### Step 6.3: 孤児検出ロジック

注: `commentIdSet` は `options.getComments()` （= `commentsRaw` の全量、フィルタ前）から構築する。`filteredComments`（ミュート・フォローフィルタ適用済み）ではない。これにより、フィルタで非表示になった親を誤って孤児と判定しない。

- [ ] `comment-list-view-model.svelte.ts` に `$derived` で孤児検出:

```ts
let orphanParentIds = $derived.by(() => {
  const allComments = options.getComments();
  const commentIdSet = new Set(allComments.map((c) => c.id));
  const orphans: string[] = [];
  for (const c of allComments) {
    if (c.replyTo !== null && !commentIdSet.has(c.replyTo)) {
      if (!orphans.includes(c.replyTo)) orphans.push(c.replyTo);
    }
  }
  return orphans;
});
```

### Step 6.4: 孤児親の fetch トリガー ($effect)

- [ ] 孤児が検出されたら fetch をトリガーする `$effect`:

```ts
$effect(() => {
  for (const parentId of orphanParentIds) {
    const estimatedPosition =
      options.getComments().find((c) => c.replyTo === parentId && c.positionMs !== null)
        ?.positionMs ?? null;
    options.fetchOrphanParent?.(parentId, estimatedPosition);
  }
});
```

### Step 6.5: orphanParents derived

- [ ] プレースホルダーのマップから表示用リストを生成:

```ts
let orphanParents = $derived.by(() => {
  const pMap = options.getPlaceholders?.() ?? new Map();
  return orphanParentIds
    .map((id) => pMap.get(id))
    .filter((p): p is PlaceholderComment => p !== undefined);
});
```

### Step 6.6: 公開 API に追加

- [ ] return に追加:

```ts
get orphanParentIds() {
  return orphanParentIds;
},
get orphanParents() {
  return orphanParents;
},
```

### Step 6.7: テスト実行して PASS を確認

- [ ] `pnpm test -- src/features/comments/ui/comment-list-view-model.test.ts`

### Step 6.8: コミット

- [ ] `git commit -m "feat: detect orphan replies and expose placeholder parents (#104)"`

---

## Task 7: CommentList の props 接続 + プレースホルダー UI

Task 7 と旧 Task 8 を統合。props 接続とプレースホルダー UI を同時に実装する。

**Files:**

- Modify: `src/lib/components/CommentList.svelte`
- Modify: 呼び出し元ルート（`src/web/routes/[platform]/[type]/[id]/+page.svelte` など）

### Step 7.1: CommentList の props に getPlaceholders / fetchOrphanParent を追加

- [ ] `CommentList.svelte` の props に追加し、`createCommentListViewModel` に渡す:

```ts
let {
  // 既存 props...
  getPlaceholders = () => new Map(),
  fetchOrphanParent = undefined
}: Props = $props();
```

- [ ] `createCommentListViewModel()` 呼び出しに渡す

### Step 7.2: ルートコンポーネントから接続

- [ ] `+page.svelte` で `commentVm.placeholders` と `commentVm.fetchOrphanParent` を `CommentList` に渡す:

```svelte
<CommentList
  ...
  getPlaceholders={() => commentVm.placeholders}
  fetchOrphanParent={commentVm.fetchOrphanParent}
/>
```

- [ ] 他のルート（profile ページ等）で `CommentList` を使っている箇所も同様に接続

### Step 7.3: プレースホルダー UI を VirtualScrollList **外** に表示

注: timed/general セクションは VirtualScrollList でラップされている。プレースホルダー親は数が少なく仮想化不要のため、各 VirtualScrollList の **前（上部）** に配置する。プレースホルダーが取得成功で消えると、通常コメントとして VirtualScrollList 内に自動で現れる。

- [ ] timed セクション向け（`positionMs !== null`）と general セクション向け（`positionMs === null`）に分離:

```svelte
{@const timedOrphans = vm.orphanParents.filter((p) => p.positionMs !== null)}
{@const generalOrphans = vm.orphanParents.filter((p) => p.positionMs === null)}
```

- [ ] 各セクションの VirtualScrollList の前にプレースホルダーを表示:

```svelte
{#snippet orphanPlaceholder(placeholder: PlaceholderComment)}
  <div class="rounded-lg border border-border-subtle bg-surface-secondary/30 px-4 py-3">
    <p class="text-sm italic text-text-muted">
      {#if placeholder.status === 'loading'}
        {t('comment.orphan.loading')}
      {:else if placeholder.status === 'deleted'}
        {t('comment.orphan.deleted')}
      {:else}
        {t('comment.orphan.not_found')}
      {/if}
    </p>
    {#if placeholder.positionMs !== null}
      <span class="mt-1 inline-block rounded-full bg-accent/10 px-2 py-0.5 font-mono text-xs text-accent">
        {formatPosition(placeholder.positionMs)}
      </span>
    {/if}
    {#if (vm.replyMap.get(placeholder.id) ?? []).length > 0}
      <div class="mt-2 space-y-2 border-l-2 border-border-subtle pl-4">
        {#each vm.replyMap.get(placeholder.id) ?? [] as reply (reply.id)}
          <CommentCard
            comment={reply}
            author={vm.authorDisplayFor(reply.pubkey)}
            ...
          />
        {/each}
      </div>
    {/if}
  </div>
{/snippet}
```

注: CommentCard の `author` prop はリプライの pubkey から取得できる（既存の `vm.authorDisplayFor`）。プレースホルダー自体にはアバター/著者情報は表示しない（システムメッセージのため）。

### Step 7.4: コミット

- [ ] `git commit -m "feat: wire and render orphan parent placeholders in CommentList (#104)"`

---

## Task 8: 全体検証

### Step 8.1: Pre-commit 検証

- [ ] `pnpm format:check && pnpm lint && pnpm check && pnpm test && pnpm test:e2e`

### Step 8.2: 手動テスト

- [ ] `pnpm dev` でリプライ送信 → position タグが付くことを確認
- [ ] 孤児リプライのプレースホルダーが表示されること確認
- [ ] プレースホルダーが「取得中…」→「取得できませんでした」に遷移すること確認
- [ ] kind:5 削除済みの場合「削除されました」と表示されること確認
- [ ] 取得成功時にプレースホルダーが消え、通常コメントに置き換わること確認

### Step 8.3: 最終コミット + PR

- [ ] `git commit` (必要なら)
- [ ] PR 作成: `gh pr create --title "feat: リプライ position 継承 + 孤児親プレースホルダー (#104)"`
