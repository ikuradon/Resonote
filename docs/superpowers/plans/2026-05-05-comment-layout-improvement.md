# コメントレイアウト改善 (A案) 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flowタブにおけるコメント行の情報の重なりを解消し、リアクションボタンを下部へ移動、ヘッダーを整理する。

**Architecture:** `CommentCard.svelte` のDOM構造を修正し、ヘッダーからアクション要素を分離してフッター（新設）に配置する。CSSでユーザー名の省略表示を実装する。

**Tech Stack:** Svelte 5, Tailwind CSS

---

### Task 1: CommentCard.svelte のヘッダー整理と省略表示の実装

**Files:**

- Modify: `src/lib/components/CommentCard.svelte`

- [ ] **Step 1: ユーザー名表示部のCSS修正**

ユーザー名が長い場合に省略されるようにスタイルを適用します。

```svelte
<!-- src/lib/components/CommentCard.svelte 修正箇所イメージ -->
<div class="flex items-center gap-2 min-w-0 flex-1">
  <UserAvatar ... />
  <a
    href={author.profileHref}
    class="text-xs font-medium text-accent hover:underline truncate min-w-0 flex-1"
    >{author.displayName}</a
  >
  {#if author.formattedNip05}
    <span class="text-xs text-text-muted truncate flex-shrink-0" title={author.nip05 ?? ''}>
      ✓{author.formattedNip05}
    </span>
  {/if}
  <span class="text-xs text-text-muted flex-shrink-0">{formatTimestamp(comment.createdAt)}</span>
</div>
```

- [ ] **Step 2: ヘッダーからのアクションボタン削除**

ヘッダー右側にあった `mode === 'flow'` の条件分岐内のボタン群を一時的に削除（またはコメントアウト）し、ヘッダーをシンプルにします。

- [ ] **Step 3: 動作確認**

長い名前のユーザーのコメントを表示し、省略（...）が発生すること、投稿時間と重ならないことを確認します。

- [ ] **Step 4: コミット**

```bash
git add src/lib/components/CommentCard.svelte
git commit -m "style(comments): truncate username in header and simplify header layout"
```

---

### Task 2: アクション行（フッター）の新設とボタンの配置

**Files:**

- Modify: `src/lib/components/CommentCard.svelte`

- [ ] **Step 1: アクション行の追加**

コメント内容の下に、再生位置とリアクションボタンを配置する新しい行を追加します。

```svelte
<!-- src/lib/components/CommentCard.svelte 修正箇所イメージ -->
<div class="mt-2 flex items-center justify-between border-t border-border-subtle pt-2">
  <div class="flex items-center gap-2">
    {#if showPosition && comment.positionMs !== null}
      <button
        type="button"
        onclick={() => onSeek(comment.positionMs!)}
        class="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 font-mono text-xs text-accent transition-colors hover:bg-accent/20"
      >
        {formatPosition(comment.positionMs)}
      </button>
    {/if}
  </div>
  <div class="flex items-center gap-4">
    <!-- 各種アクションボタン (Reply, Repost, Like, Menu) を配置 -->
  </div>
</div>
```

- [ ] **Step 2: ボタンの間隔とアイコンサイズの調整**

モバイルでの押しやすさを考慮し、`gap-4` 程度の十分な余白を設定します。

- [ ] **Step 3: 動作確認**

Flowタブで再生位置ボタンとリアクションボタンが正しく表示され、機能することを確認します。

- [ ] **Step 4: コミット**

```bash
git add src/lib/components/CommentCard.svelte
git commit -m "feat(comments): move reaction buttons and position to footer row in Flow mode"
```

---

### Task 3: Shoutモードとの統合とスタイルの微調整

**Files:**

- Modify: `src/lib/components/CommentCard.svelte`

- [ ] **Step 1: 重複コードの整理**

FlowモードとShoutモードでアクションボタンの実装が重複しているため、スニペット化または共通のコンポーネントパーツとして整理します。

- [ ] **Step 2: 最終的なビジュアル調整**

全体のパディングやボーダーの太さ、色のコントラストなどを確認し、微調整します。

- [ ] **Step 3: E2Eテストの実行**

既存のコメント関連テストが壊れていないか確認します。
Run: `pnpm test:e2e e2e/comment-rendering.test.ts`

- [ ] **Step 4: コミット**

```bash
git add src/lib/components/CommentCard.svelte
git commit -m "refactor(comments): unify action row layout across Flow and Shout modes"
```
