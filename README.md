# Resonote

Spotify の再生位置に同期したコメントを Nostr プロトコルで共有する音楽コメントシステム。

## 特徴

- **再生位置同期コメント** — Spotify IFrame API から再生位置を取得し、コメントにタイムスタンプを紐づけ
- **全体コメント** — 再生位置に依存しない感想・レビューも投稿可能
- **リアクション** — コメントへの「+」リアクション (NIP-25 kind:7)
- **投稿削除** — 自分のコメントを削除 (NIP-09 kind:5)
- **リレー自動切替** — ログイン時にユーザーの NIP-65 リレーリストを適用
- **リレー接続状況** — 接続中リレーの状態をリアルタイム表示

## 対応 NIP

| NIP    | 用途                                             |
| ------ | ------------------------------------------------ |
| NIP-07 | ブラウザ拡張署名 (`window.nostr`)                |
| NIP-09 | イベント削除 (kind:5)                            |
| NIP-22 | コメント (kind:1111)                             |
| NIP-25 | リアクション (kind:7)                            |
| NIP-65 | リレーリストメタデータ (kind:10002)              |
| NIP-73 | 外部コンテンツ ID (`["I", "spotify:track:..."]`) |

## セットアップ

```bash
pnpm install
pnpm run dev
```

## コマンド

| コマンド             | 説明                                     |
| -------------------- | ---------------------------------------- |
| `pnpm run dev`       | 開発サーバー起動 (http://localhost:5173) |
| `pnpm run build`     | プロダクションビルド → `build/`          |
| `pnpm run preview`   | ビルド結果のプレビュー                   |
| `pnpm run check`     | svelte-kit sync + 型チェック             |
| `pnpm test`          | 単体テスト実行                           |
| `pnpm test:coverage` | カバレッジ付きテスト                     |
| `pnpm test:e2e`      | Playwright E2E テスト                    |
| `pnpm run lint`      | ESLint                                   |
| `pnpm run format`    | Prettier フォーマット                    |

## 技術スタック

- **フレームワーク**: SvelteKit (SPA モード, Svelte 5 runes)
- **アダプタ**: @sveltejs/adapter-static (`fallback: '200.html'`)
- **スタイリング**: Tailwind CSS v4
- **Nostr クライアント**: rx-nostr + @rx-nostr/crypto
- **認証**: @konemono/nostr-login
- **テスト**: Vitest (単体) + Playwright (E2E)
- **CI**: GitHub Actions (lint → format → type-check → test → E2E)

## アーキテクチャ

### ContentProvider パターン

`src/lib/content/types.ts` で `ContentProvider` インターフェースを定義。
各プラットフォーム (Spotify、将来的に YouTube/Apple Music) がこのインターフェースを実装。
`toNostrTag()` で NIP-73 `["I", ...]` タグを生成。

### 再生位置同期

1. Spotify IFrame API の `playback_update` イベントで再生位置を取得
2. コメント投稿時に `["position", "mm:ss"]` タグを付与
3. コメント表示時に再生位置付近 (±5秒) のコメントをハイライト
4. タイムスタンプクリックでその位置にシーク

### コメント表示

- **Time Comments** — 再生位置付きコメント、位置の昇順で表示
- **General** — 全体コメント、投稿日時の新しい順で表示

## ライセンス

MIT
