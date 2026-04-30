# Keyboard Shortcuts

## Summary

コンテンツページでキーボードショートカットを実装する。コメント操作、タブ切替、再生制御、ナビゲーションを網羅。

## Shortcut Map

| Key              | Action                                   | Condition                        |
| ---------------- | ---------------------------------------- | -------------------------------- |
| `n`              | 投稿フォームフォーカス                   | Flow/Shout タブ + ログイン時     |
| `Ctrl/Cmd+Enter` | 投稿送信                                 | フォームフォーカス中             |
| `f`              | Flow タブ切替                            | -                                |
| `s`              | Shout タブ切替                           | -                                |
| `i`              | Info タブ切替                            | -                                |
| `j`              | 次のコメント選択                         | Flow/Shout タブ                  |
| `k`              | 前のコメント選択                         | Flow/Shout タブ                  |
| `r`              | 選択コメントに返信                       | コメント選択中 + ログイン時      |
| `l`              | 選択コメントにいいね                     | コメント選択中 + ログイン時      |
| `Escape`         | フォーカス解除 / モーダル閉じ / 選択解除 | -                                |
| `b`              | ブックマーク（確認ダイアログ）           | ログイン時                       |
| `Shift+s`        | 共有モーダル                             | -                                |
| `p`              | 再生/一時停止                            | Spotify/YouTube/Audio のみ       |
| `←`              | 5秒戻し                                  | シーク対応プレイヤー（全 embed） |
| `→`              | 5秒送り                                  | シーク対応プレイヤー（全 embed） |
| `?`              | ショートカット一覧モーダル               | -                                |

## Input Guard

テキスト入力中（input/textarea/contenteditable にフォーカス）は単一キーショートカットを無効化する。修飾キー付き（Ctrl/Cmd+Enter）は常に有効。

## Architecture

### New Files

| File                                              | Responsibility                                                                         |
| ------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `src/shared/browser/keyboard-shortcuts.svelte.ts` | ショートカットマネージャー。`keydown` イベント登録、アクションディスパッチ、入力ガード |
| `src/lib/components/ShortcutHelpDialog.svelte`    | `?` で表示するショートカット一覧モーダル                                               |

### Modified Files

| File                                                 | Change                                                          |
| ---------------------------------------------------- | --------------------------------------------------------------- |
| `src/lib/components/CommentList.svelte`              | j/k 選択状態管理、r/l ハンドラ、選択ハイライト                  |
| `src/lib/components/CommentCard.svelte`              | 選択状態のハイライトリング表示（`data-comment-index` 属性追加） |
| `src/lib/components/CommentForm.svelte`              | Ctrl/Cmd+Enter 送信（既に実装されている可能性あり → 調査）      |
| `src/web/routes/[platform]/[type]/[id]/+page.svelte` | ショートカットマネージャー初期化、プレイヤー制御の接続          |
| `src/shared/i18n/*.json`                             | ショートカットヘルプ用 i18n キー                                |

## Comment Selection (j/k)

- `selectedCommentIndex` state を CommentList に追加
- j で +1、k で -1（表示中のフィルタ済みコメントリスト内）
- 選択コメントにスクロール追従（VirtualScrollList の `scrollToIndex`）
- 選択中のコメントは `ring-2 ring-accent/50` でハイライト
- Escape で選択解除 (`selectedCommentIndex = -1`)
- タブ切替時に選択解除

## Playback Control (p, ←/→)

- `p` キー: `resonote:toggle-playback` カスタムイベントを dispatch
  - Spotify/YouTube/Audio: play/pause トグル
  - その他: トースト「このプレイヤーではショートカット非対応です」
- `←/→` キー: `resonote:seek` イベントを dispatch（現在位置 ± 5000ms）
  - 全プラットフォーム対応（全 embed が seek 実装済み）

## Shortcut Help Dialog

- ConfirmDialog ベースのモーダル（cancel ボタンなし）
- 2カラムレイアウト: キー表示（`<kbd>` スタイル）+ 説明
- カテゴリ分け: コメント / タブ / 再生 / その他
- Escape または背景クリックで閉じる

## Testing

### Unit Tests

- keyboard-shortcuts: イベントハンドリング、入力ガード、修飾キー判定
- j/k 選択: インデックス境界チェック、タブ切替時リセット

### E2E Tests

- `?` でヘルプモーダル表示
- `f`/`s`/`i` でタブ切替
- `n` でフォームフォーカス

## i18n

新規キー:

- `shortcuts.title` — ショートカット一覧タイトル
- `shortcuts.category.comment` — コメント
- `shortcuts.category.tab` — タブ
- `shortcuts.category.playback` — 再生
- `shortcuts.category.other` — その他
- 各ショートカットの説明キー
- `playback.shortcut_unsupported` — プレイヤー非対応トースト
