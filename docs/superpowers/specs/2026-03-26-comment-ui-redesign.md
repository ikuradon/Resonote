# Comment UI Redesign

Date: 2026-03-26
Issue: #154 (feat: 再生前でもタイムスタンプ付きコメントを表示する)

## Summary

コメントセクションを 3 タブ構成（Flow / Shout / Info）に再設計し、timed コメントを主役にした UX を実現する。全デバイス共通の統一タブ UI、Form のボトム sticky 配置、Shout タブのチャット式 TL を導入する。

## Design Decisions

| 項目               | 決定                                                |
| ------------------ | --------------------------------------------------- |
| コンセプト         | timed コメント主役（ニコニコ寄り）                  |
| タブ構成           | 🎶 Flow / 📢 Shout / ℹ️ Info（3 タブ）              |
| デフォルトタブ     | 🎶 Flow                                             |
| Desktop タブラベル | `🎶 Flow (5)` `📢 Shout (12)` `ℹ️ Info`             |
| Mobile タブラベル  | `🎶 (5)` `📢 (12)` `ℹ️`                             |
| Form 位置          | タブコンテンツの下（sticky）                        |
| Filter 位置        | Heading 行にドロップダウン（`Comments ── [All ▾]`） |
| Empty State        | 誘導的 CTA（▶ 再生してコメントを投稿しよう）        |
| デバイス間統一     | 全デバイス共通タブ UI                               |

## Structure

```
┌─ Comment Section ──────────────────────┐
│                                        │
│  Heading: Comments ─── [All ▾]         │
│                                        │
│  Tab Bar:                              │
│  [🎶 Flow (5)] [📢 Shout (12)] [ℹ️ Info] │
│  ═══════════                           │
│                                        │
│  Tab Content:                          │
│  ┌──────────────────────────────┐      │
│  │ VirtualScrollList            │      │
│  │ or Empty State (CTA)        │      │
│  └──────────────────────────────┘      │
│                                        │
│  Form (sticky bottom):                 │
│  [avatar] [textarea] [CW][😀] [⏱] [→] │
│                                        │
└────────────────────────────────────────┘
```

## Tab Contents

### 🎶 Flow（timed コメント）

- コメントを `positionMs` 昇順でソート
- 各コメントにタイムスタンプバッジ（`1:30`）。クリックで seek + 再生開始
- 再生中は `nearCurrent` ハイライト（現在 ±5 秒）+ auto-scroll
- `userScrolledAway` 時は「Jump to Now」ボタン表示
- Empty State: 「▶ 再生してコメントを投稿しよう」「再生位置に紐づくコメントが表示されます」

### 📢 Shout（フリーコメント、チャット式）

- コメントを `createdAt` **昇順**でソート（古い順 = 上、新しい順 = 下）
- 初期表示時はリスト下端（最新）にスクロール済み
- 新着コメントはリスト下部に追加
- **Auto-scroll**: 下端に張り付いている時のみ新着に追従。上にスクロールして過去を読んでいる間は追従しない
- 下端に戻る or「最新へ」ボタンタップで追従再開
- タイムスタンプバッジなし
- Empty State: 「まだコメントはありません」

### ℹ️ Info

- Share ボタン
- Bookmark ボタン（★ / ☆ トグル）
- コンテンツへの外部リンク（Open in Spotify 等）
- 将来的にトラック詳細情報も追加可能

## Comment Actions

### Flow — コンパクトインライン

コメント右端に横並び 3 アイコン：

```
[content...]          💬  ♡ 2  ⋮
```

- 💬 Reply
- ♡ Like（件数表示）
- ⋮ More（ポップアップメニュー）

### Shout — フルアクション行

コンテンツ下に 3 行目としてアクションバー：

```
avatar  name  time
content text
[Reply] [ReNote] [♡ 3] [😀+] [⋮]
```

- Reply（返信件数があれば表示）
- ReNote（kind:6 リポスト）
- ♡ Like（件数表示）
- 😀+ Custom Emoji
- ⋮ More（ポップアップメニュー）

カスタム絵文字リアクションがある場合はアクション行の上にピル表示：

```
🔥 4  👍 2  🎵 1
[Reply] [ReNote] [♡ 3] [😀+] [⋮]
```

### ⋮ More メニュー（Flow / Shout 共通）

| 項目         | アイコン | 表示条件                                               |
| ------------ | -------- | ------------------------------------------------------ |
| Quote        | 💬       | 常時                                                   |
| Custom Emoji | 😀       | 常時（Flow のみ。Shout ではアクション行の 😀+ で対応） |
| Copy ID      | 📋       | 常時（nevent bech32 をクリップボードにコピー）         |
| Broadcast    | 📡       | 常時（他リレーに再配信）                               |
| Mute User    | 🔇       | 他人のコメント                                         |
| Mute Thread  | 🔕       | 常時                                                   |
| Delete       | 🗑       | 自分のコメントのみ                                     |

Flow ではインラインにある Reply / Like はメニューに含めない。
Shout ではアクション行にある Reply / ReNote / Like / Custom Emoji はメニューに含めない。
メニューコンポーネント自体は共通で、インラインに出ているアクションを除外するだけ。

## Form Behavior

Form はタブコンテンツ下部に sticky 配置。選択中タブに連動。

| 状態               | Form の表示                                                                                                             |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Flow タブ + 再生中 | `[avatar] [Add a flow comment...] [CW][😀] [⏱ 1:30] [→]`                                                                |
| Flow タブ + 再生前 | `[avatar] [Add a flow comment...] [CW][😀] [⏱ --:--] [→]` — タイムスタンプ disabled、送信時に「再生を開始してください」 |
| Shout タブ         | `[avatar] [Shout something...] [CW][😀] [→]` — タイムスタンプ表示なし                                                   |
| Info タブ          | Form 非表示                                                                                                             |
| 未ログイン         | `[ログインしてコメント]` プロンプト（現状維持）                                                                         |

- CW ボタンと絵文字ボタンは textarea フォーカス時に表示
- Timed/General 切替ボタンは Form から削除（タブ連動で不要）

## Responsive Design

### Desktop（md 以上）

```
┌─────────────────────┬──────────────────────┐
│                     │ Comments ── [All ▾]  │
│   Embed Player      │ [🎶 Flow] [📢 Shout] [ℹ️ Info] │
│                     │ ┌──────────────────┐ │
│                     │ │ VirtualScrollList│ │
│                     │ └──────────────────┘ │
│                     │ [Form sticky bottom] │
└─────────────────────┴──────────────────────┘
```

- 2 カラム（Player 左、Comments 右）
- タブラベル付き: `🎶 Flow (5)` `📢 Shout (12)` `ℹ️ Info`

### Tablet（sm〜md）

- 同じ 2 カラムだがカラム幅が均等に近づく
- タブラベルは件数のみ省略可: `🎶 Flow` `📢 Shout` `ℹ️ Info`

### Mobile（sm 未満）

```
┌────────────────────┐
│   Embed Player     │
├────────────────────┤
│ Comments ─ [All ▾] │
│ [🎶(5)] [📢(12)] [ℹ️] │
│ ┌────────────────┐ │
│ │ ScrollList     │ │
│ └────────────────┘ │
│ [Form sticky]      │
└────────────────────┘
```

- 1 カラム。Player 上、Comments 下
- タブはアイコン + 件数のみ

### Mobile Keyboard Behavior

キーボード表示時に Embed Player や ScrollList を移動しない：

- `<meta name="viewport">` に `interactive-widget=resizes-content` を指定
- layout viewport は固定。visual viewport のみ縮小
- Form は `position: sticky` でコメントカラム内に留める
- iOS Safari: `visualViewport` API または `env(keyboard-inset-height)` で Form 位置調整

```
┌────────────────────┐
│   Embed Player     │  ← 動かない
├────────────────────┤
│ [🎶(5)] [📢(12)] [ℹ️] │  ← 動かない
│ ┌────────────────┐ │
│ │ ScrollList     │ │  ← 動かない（表示領域は縮小）
│ └────────────────┘ │
│ [Form]             │  ← キーボード直上
├────────────────────┤
│ ┌ Keyboard ──────┐ │
│ └────────────────┘ │
└────────────────────┘
```

## Files to Modify

| ファイル                                                     | 変更内容                                                                                     |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `src/lib/components/CommentList.svelte`                      | タブ UI 導入。Timed/General セクション縦積み → タブ切替。Empty State 追加。Form を内部に移動 |
| `src/lib/components/CommentForm.svelte`                      | 下部 sticky 化。Timed/General 切替ボタン削除（タブ連動）。展開時に CW + 絵文字ボタン表示     |
| `src/lib/components/CommentCard.svelte`                      | Flow 用コンパクトアクション（右寄せ 3 アイコン）と Shout 用フルアクション行の切替            |
| `src/lib/components/CommentFilterBar.svelte`                 | Heading 行内のドロップダウンに変更                                                           |
| `src/lib/components/CommentActionMenu.svelte`                | **新規** — ⋮ ポップアップメニュー（共通コンポーネント）                                      |
| `src/features/comments/ui/comment-list-view-model.svelte.ts` | `activeTab` state 追加。Shout チャット式ソート・auto-scroll ロジック                         |
| `src/features/comments/ui/comment-form-view-model.svelte.ts` | タブ連動。Flow タブ → effectiveAttach=true。Timed/General 切替メソッド削除                   |
| `src/web/routes/[platform]/[type]/[id]/+page.svelte`         | Share/Bookmark を Info タブへ移動。CommentForm を CommentList 内部に移動                     |
| `src/web/app.html`                                           | `interactive-widget=resizes-content` を viewport meta に追加                                 |
| `src/shared/i18n/`                                           | 各言語ファイルに Flow, Shout, Info, Empty State, メニュー項目のキー追加                      |

## Files NOT Modified

- `VirtualScrollList.svelte` — 既存のまま（items 差し替えで対応）
- `src/shared/nostr/events.ts` — イベント構造は変更なし
- `src/features/comments/domain/` — ドメインロジックは変更なし

## New File

- `src/lib/components/CommentActionMenu.svelte` — ⋮ ポップアップメニュー

## Migration Notes

- `General` → `Shout` のリネーム: i18n キー、view model プロパティ名、テスト
- `CommentForm` の `selectTimedComment()` / `selectGeneralComment()` メソッド削除
- `CommentFilterBar` は独立コンポーネントから Heading 行に統合（コンポーネント削除 or インライン化）
- 既存 E2E テスト: `data-testid` の変更が必要（セクションヘッダー → タブバー）
