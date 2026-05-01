# Issue #32: Virtual Scroll Comment List

## Overview

CommentList の timed comments を仮想スクロール方式に再設計。`nearbyTimedComments` フィルタリングを廃止し、全コメントをソート済みリストで仮想描画 + 再生位置に自動スクロール。general comments も同じ VirtualScrollList コンポーネントで描画。

## VirtualScrollList Component

自前実装。外部ライブラリ (svelte-virtuallists, @josesan9/svelte-virtual-scroll-list, @tanstack/svelte-virtual) は全て Svelte 5.53 との互換性問題 (`$props is not defined` ランタイムエラー) で不採用。

### Architecture

```
items[] → prefix sum (累積高さ配列)
         → binary search で visible range 算出
         → overscan 含む slice のみ DOM 化
         → ResizeObserver で実測値をキャッシュ
         → 変更点以降の prefix sum 再計算 → 再描画
```

### Performance: Prefix Sum + Binary Search

現在の O(n) 走査を改善。

- `offsets: number[]` — `offsets[i]` = items[0..i) の累積高さ。length = items.length + 1
- `offsets[items.length]` = totalHeight
- 高さ変更時: 変更点 k 以降の offsets を線形再計算 O(n-k)。Fenwick Tree は不採用（コメント数 ~1000 では単純再計算で十分、複雑性に見合わない）
- items 配列全体が差し替わった場合: offsets を全再構築 O(n)
- `getOffsetForIndex(i)` = `offsets[i]` → O(1)
- `getIndexForOffset(scrollTop)` = offsets 上の binary search → O(log n)
- `totalHeight` = `offsets[items.length]` → O(1)
- `offsetTop` = `offsets[visibleRange.start]` → O(1)

### ResizeObserver の改善

現在の実装: `$effect` cleanup で `resizeObserver.disconnect()` → 再 observe。全解除+全再登録が毎回走る。

改善: 観測中要素を `Set<Element>` で管理。

- 新規要素: `observe()` して Set に追加
- 離脱要素: `unobserve()` して Set から削除
- 差分のみ操作、全 disconnect しない

### Height 変更時のスクロール位置補正

ResizeObserver コールバック内で処理。複数アイテムが同時に変更される場合も一括対応。

```
let totalDelta = 0;
for (entry of entries) {
  if (entry is above viewport) {
    totalDelta += (newHeight - oldHeight);
  }
}
if (totalDelta !== 0) {
  container.scrollTop += totalDelta;
}
```

「above viewport」の判定は、prefix sum の offsets を使って O(1) で確認。

### Programmatic Scroll Flag

`scrollToIndex()` / `scrollToOffset()` 呼び出し後 500ms は `isProgrammaticScroll = true`。`isAutoScrolling()` メソッドで外部から参照可能。user-scroll-away の誤検出を防ぐ。

### Edge Cases

- `items.length === 0`: visibleRange = {start: 0, end: -1}, renderedItems = [], totalHeight = 0
- 高速スクロール中: overscan がバッファ。描画が追いつかない場合は estimateHeight で補間
- 全削除後の再追加: prevItemKeys が空 → スクロール位置補正スキップ（正しい動作）

### Public API

```ts
scrollToIndex(index: number): void     // 中央にスムーズスクロール
scrollToOffset(offset: number): void   // 指定オフセットにスムーズスクロール
isAutoScrolling(): boolean             // プログラマティックスクロール中か
```

### Props

```ts
interface Props<T> {
  items: T[];
  keyFn: (item: T) => string;
  estimateHeight?: number; // default: 80
  overscan?: number; // default: 5
  children: Snippet<[{ item: T; index: number }]>;
  onRangeChange?: (start: number, end: number) => void;
}
```

## Comment List Integration

### Timed Comments

- VirtualScrollList インスタンス #1
- `positionMs` 昇順ソート
- auto-scroll: `player.position` 変更 → `findNearestIndex()` (binary search) → `scrollToIndex()`
- ユーザーが手動スクロールで離脱 → 「Jump to now」ボタン表示
- 現在再生位置 ±5秒 のコメントを背景ハイライト

### General Comments

- VirtualScrollList インスタンス #2
- `createdAt` 降順ソート (newest first)
- auto-scroll なし
- 新着は上部に挿入 → スクロール位置補正が自然に効く

### New Comment Highlight

新着コメントに `arrivedAt: number` タイムスタンプ。`Date.now() - arrivedAt < 3000` の間、`bg-accent/20` → `bg-transparent` のフェードアニメーション。背景色のみで高さに影響なし。

### Removed

- `nearbyTimedComments` derived chain
- `showAllTimed` state
- `timedLimit` / `generalLimit` pagination
- 「Nearby / All」toggle UI

## Playbook Demo

### Auto-add Mode

- toggle ボタンで on/off
- ランダム間隔 (0.5-3秒) でコメント到着をシミュレート
- 到着コメントに `arrivedAt` 付与 → ハイライトアニメーション表示

### FPS Display

- `requestAnimationFrame` カウンターで FPS 計測
- controls エリアに表示

### Realistic Comment Cards

- CW (Content Warning) 付きコメント
- カスタム絵文字付きコメント（img タグ）
- 様々なコンテンツ長さ（1行〜5行以上）

## Testing

- unit test: prefix sum の構築・更新、binary search、edge cases (空配列、1要素、大量要素)
- E2E test: playbook ページがエラーなく描画されること（既存 E2E でカバー）
- 手動テスト: playbook の auto-add モードで FPS を確認、500+ コメントでのスクロール性能

## Files

- `src/lib/components/VirtualScrollList.svelte` — 改善 (prefix sum, ResizeObserver, height compensation)
- `src/web/routes/playbook/+page.svelte` — デモ改善 (auto-add, FPS, realistic cards)

## Out of Scope

- CommentList.svelte 本体への統合（別 PR で実施）
- general comments の VirtualScrollList 化（本 PR ではデモのみ）
- アクセシビリティ (role="listbox", aria-setsize 等) — CommentList 統合 PR で対応
