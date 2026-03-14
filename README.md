# Resonote

Nostr プロトコルを使ったメディアコメント同期システム。動画・音楽の再生位置にコメントを紐づけて共有。

NIP-73 (External Content IDs) + NIP-22 (Comments, kind:1111) + NIP-25 (Reactions, kind:7) を活用。

## 特徴

- **再生位置同期コメント** — 再生中のメディアの位置を取得し、コメントにタイムスタンプを紐づけ
- **全体コメント** — 再生位置に依存しない感想・レビューも投稿可能
- **返信スレッド** — コメントへの返信 (NIP-10 スタイルの `e` タグ参照)
- **リアクション** — コメントへのリアクション (NIP-25 kind:7)、カスタム絵文字対応
- **投稿削除** — 自分のコメント・リアクションを削除 (NIP-09 kind:5)
- **フォロー & Web of Trust** — NIP-02 フォローリストによるコメントフィルタリング (all / follows / WoT)
- **リレー自動切替** — ログイン時にユーザーの NIP-65 リレーリストを適用
- **リレー接続状況** — 接続中リレーの状態をリアルタイム表示
- **ブラウザ拡張機能** — Chrome / Firefox 拡張 (Manifest V3) でサイドパネルからコメント

## 対応プラットフォーム

| プラットフォーム | Web アプリ | 拡張機能が必要 |
| ---------------- | ---------- | -------------- |
| Spotify          | ✅         |                |
| YouTube          | ✅         |                |
| Netflix          |            | ✅             |
| Prime Video      |            | ✅             |
| Disney+          |            | ✅             |
| Apple Music      |            | ✅             |
| SoundCloud       |            | ✅             |
| Fountain.fm      |            | ✅             |
| AbemaTV          |            | ✅             |
| TVer             |            | ✅             |
| U-NEXT           |            | ✅             |

## 対応 NIP

| NIP    | 用途                                             |
| ------ | ------------------------------------------------ |
| NIP-02 | フォローリスト (kind:3)                          |
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

| コマンド                     | 説明                                       |
| ---------------------------- | ------------------------------------------ |
| `pnpm run dev`               | 開発サーバー起動 (http://localhost:5173)   |
| `pnpm run build`             | プロダクションビルド → `build/`            |
| `pnpm run preview`           | ビルド結果のプレビュー                     |
| `pnpm run check`             | svelte-kit sync + 型チェック               |
| `pnpm test`                  | 単体テスト実行                             |
| `pnpm test:coverage`         | カバレッジ付きテスト                       |
| `pnpm test:e2e`              | Playwright E2E テスト                      |
| `pnpm run lint`              | ESLint                                     |
| `pnpm run format`            | Prettier フォーマット                      |
| `pnpm run build:ext:chrome`  | Chrome 拡張機能ビルド → `dist-extension/`  |
| `pnpm run build:ext:firefox` | Firefox 拡張機能ビルド → `dist-extension/` |

## 技術スタック

- **フレームワーク**: SvelteKit (SPA モード, Svelte 5 runes)
- **アダプタ**: @sveltejs/adapter-static (`fallback: 'index.html'`)
- **スタイリング**: Tailwind CSS v4
- **Nostr クライアント**: rx-nostr + @rx-nostr/crypto
- **認証**: @konemono/nostr-login
- **テスト**: Vitest (単体) + Playwright (E2E)
- **CI**: GitHub Actions (format → lint → check → test → E2E)
- **ホスティング**: Cloudflare Pages

## アーキテクチャ

### ContentProvider パターン

`src/lib/content/types.ts` で `ContentProvider` インターフェースを定義。
各プラットフォームがこのインターフェースを実装し、`requiresExtension` フラグで Web / 拡張機能の区別を制御。
`toNostrTag()` で NIP-73 `["I", ...]` タグを生成。

### 再生位置同期

1. Spotify IFrame API / YouTube IFrame Player API で再生位置を取得
2. コメント投稿時に `["position", "秒数"]` タグを付与
3. コメント表示時に再生位置 ±30秒 のコメントを絞り込み、±5秒 以内をハイライト
4. タイムスタンプクリックでその位置にシーク

### コメント表示

- **Time Comments** — 再生位置付きコメント、位置の昇順で表示
- **General** — 全体コメント、投稿日時の新しい順で表示

### ブラウザ拡張機能

`src/extension/` にChrome / Firefox 対応の Manifest V3 拡張機能を実装。
コンテンツスクリプトが各動画・音楽サイトの再生位置を取得し、サイドパネル内の Resonote アプリと postMessage で連携。

## ライセンス

MIT
