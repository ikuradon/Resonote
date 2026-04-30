# モバイルリデザイン (#31)

**Date**: 2026-03-17
**Issue**: #31

## Summary

320-375px スマートフォンでの水平オーバーフローを修正し、モバイルファーストな UX に再設計する。

## Design Decisions

- ヘッダー: ハンバーガーメニュー + フルスクリーンオーバーレイ
- ドロップダウン: モバイルではフルスクリーンオーバーレイに統一
- モーダル: マージン修正のみ（フルスクリーン化しない）
- font-mono: truncate で省略表示
- Breakpoint: `lg:` (1024px) でモバイル/デスクトップ切替

---

## 1. MobileOverlay 共通コンポーネント

**新規ファイル**: `src/lib/components/MobileOverlay.svelte`

フルスクリーンオーバーレイの共通 UI。ヘッダーメニュー、NotificationBell、RelayStatus、NoteInput で共有。

```
Props:
  - open: boolean
  - onclose: () => void
  - title?: string

Markup:
  - role="dialog" aria-modal="true" aria-labelledby={titleId}

Behavior:
  - フルスクリーン固定 (fixed inset-0 z-50)
  - 背景: bg-surface-0/95 backdrop-blur
  - ヘッダー: title + ✕ ボタン
  - アニメーション: fade-in
  - body scroll lock ($effect):
    open 時に document.body.style.overflow を保存して 'hidden' に設定。
    cleanup で元の値に復元（close 時・コンポーネント破棄時の両方に対応）。
  - フォーカストラップ:
    open 時に ✕ ボタン (または最初の focusable 要素) にフォーカス移動。
    Tab/Shift+Tab を overlay 内の focusable 要素に閉じ込める。
    close 時にトリガー要素にフォーカスを戻す。
  - ESC キーで close
  - lg 以上では使わない (呼び出し元が matchMedia で切替)
```

---

## 2. ヘッダー

**変更ファイル**: `src/web/routes/+layout.svelte`

### モバイル (< lg)

- 表示: `[Logo] ... [🔔] [☰]`
- ☰ タップ → MobileOverlay でメニュー展開
- メニュー内容: Language, Relays, Bookmarks, Settings, Profile/Login
- NotificationBell はヘッダーに残す（即時確認の重要度が高い）

### デスクトップ (lg 以上)

- 現状維持: `[Logo] ... [Language] [RelayStatus] [Bookmarks] [Settings] [🔔] [Login]`

### 実装

- `lg:hidden` / `hidden lg:flex` で切替
- 新規 state: `let menuOpen = $state(false)`
- MobileOverlay 内にメニューアイテムをリスト表示
- 各アイテムは `<a href="...">` (Bookmarks, Settings) または inline コンポーネント (RelayStatus)
- LanguageSwitcher: MobileOverlay 内ではドロップダウンを使わず、各言語をボタンとしてリスト表示（入れ子 UI を避ける）

---

## 3. NotificationBell

**変更ファイル**: `src/lib/components/NotificationBell.svelte`

### モバイル (< lg)

- ベルアイコンタップ → MobileOverlay で通知一覧表示
- `w-80` ドロップダウンを削除し、MobileOverlay の slot に通知リストを配置
- 通知リストは既存のマークアップをそのまま使用

### デスクトップ (lg 以上)

- 現状の `w-80` ドロップダウン維持

### 実装

- `matchMedia('(min-width: 1024px)')` リスナーで `isDesktop` state を管理
- `{#if isDesktop}` でドロップダウン / `{:else}` で MobileOverlay を切替
- CSS-only 両方描画は避ける（`open` state 共有で `markAllAsRead` 二重実行のリスク）

---

## 4. RelayStatus

**変更ファイル**: `src/lib/components/RelayStatus.svelte`

### モバイル (< lg)

- ヘッダーメニュー内の「Relays」タップ → MobileOverlay でリレー状態表示
- `w-64` ドロップダウンを削除

### デスクトップ (lg 以上)

- 現状の `w-64` ドロップダウン維持

---

## 5. NoteInput オートコンプリート

**変更ファイル**: `src/lib/components/NoteInput.svelte`

### モバイル (< lg)

- `w-64` オートコンプリート → MobileOverlay で候補表示
- `:` 入力時に MobileOverlay が開き、絵文字候補を表示

### デスクトップ (lg 以上)

- 現状の `w-64` ドロップダウン維持

---

## 6. ShareButton モーダル

**変更ファイル**: `src/lib/components/ShareButton.svelte`

- `max-w-sm` → `max-w-[calc(100vw-2rem)] sm:max-w-sm`
- `mx-4` を維持（既にある）
- 320px: 100vw - 2rem = 288px で収まる
- 注意: モーダルに `overflow-hidden` を追加しないこと（内部の NoteInput autocomplete が切れる）

---

## 7. ConfirmDialog モーダル

**変更ファイル**: `src/lib/components/ConfirmDialog.svelte`

- `max-w-sm` → `max-w-[calc(100vw-1.5rem)] sm:max-w-sm`
- 外側に `mx-3` を追加（現在なし）

---

## 8. ホームページ

**変更ファイル**: `src/web/routes/+page.svelte`

- 既に `w-full max-w-lg` が設定済み。親の `px-5` で自然に制約される。
- **変更不要** — 現状で 320px でも overflow しない。

---

## 9. font-mono 要素

**変更ファイル**: 複数 (profile, notifications, comments)

- 長い pubkey/event ID 表示に `truncate` クラスを追加
- 必要に応じて title 属性で全文をツールチップ表示
- 対象箇所は実装時に grep `font-mono` で特定

---

## Breakpoint 戦略

| Breakpoint        | 用途                                                                 |
| ----------------- | -------------------------------------------------------------------- |
| デフォルト (< lg) | モバイルレイアウト。ハンバーガーメニュー、フルスクリーンオーバーレイ |
| `lg:` (1024px)    | デスクトップ。横一列ヘッダー、ドロップダウン、二段組                 |

`md:` は #30 で後日対応（タブレット最適化）。

## Testing

- E2E: `e2e/responsive.test.ts` の tablet viewport (768px) テストを更新。`login-button` は 768px ではハンバーガーメニュー内に移動するため、直接 visible ではなくなる。メニュー展開後の visible チェックに変更。
- E2E: 既存テストがモバイル幅で壊れないことを確認
- 手動: Chrome DevTools で 320px, 375px, 768px, 1024px をチェック
- `overflow-x: hidden` をルートに追加して水平スクロールバーが出ないことを確認
