# Resonote — Feature Backlog

## 実装候補

| # | 機能 | 方式 | 優先度 | 備考 |
|---|------|------|--------|------|
| 1 | **OGP** | Cloudflare Pages Functions でボット UA 検出 → Spotify/YouTube oEmbed API (認証不要) からタイトル・サムネ取得 → OG タグ付き HTML 返却 | 中 | 調査・方式確定済み。デプロイ構成変更 (Pages Functions 追加) が必要 |
| 2 | **NIP-50 検索** | リレー側 NIP-50 対応が前提。コメントのキーワード/ハッシュタグ検索 | 中 | コンテンツ発見性の大幅向上 |
| 3 | **ブロックリスト (NIP-51 kind:10001)** | ミュート (kind:10000) は実装済み。ブロックはインタラクション自体を防止 | 低 | ミュートで大部分カバー |
| 4 | **NIP-18 リポスト** | 他者のコメントを kind:6 で Nostr にリシェア | 低 | |
| 5 | **Extension 自動検出** | ページ読み込み時にコンテンツを自動検出してコメント取得開始 | 中 | 拡張機能の UX 向上 |
| 6 | **Report/Flag (NIP-56/kind:1984)** | スパム/悪質コンテンツの報告。リレーオペレーターへの通知 | 低 | |
| 7 | **トレンドコンテンツ** | コメント/リアクション数でホットなコンテンツを発見。ホームページに表示 | 中 | 実装コスト大 (集計ロジック) |
| 8 | **ユーザーレピュテーション** | フォロー/リアクションベースの信頼スコア | 低 | |
| ~~9~~ | ~~**URL パーサー網羅性調査**~~ | ~~実装済み: Spotify intl-{locale}, SoundCloud m. 対応~~ | ~~完了~~ | |
| ~~10~~ | ~~**Vimeo Web 埋め込み**~~ | ~~実装済み~~ | ~~完了~~ | |
| ~~11~~ | ~~**Mixcloud Web 埋め込み**~~ | ~~実装済み~~ | ~~完了~~ | |
| 12 | **ニコニコ動画 Web 埋め込み** | postMessage API (非公式)。seek/playerMetadataChange で再生同期。認証不要 | 中 | 日本市場で重要。非公式 API のため突然壊れるリスク。実装前に実機確認要 |
| 13 | **Podbean Web 埋め込み** | Widget API (`api.js` + `PB`)。seekTo(ms)/getPosition(cb)。SoundCloud/Spotify と同一パターン | 中 | Podcast ホスティング大手 |
| ~~14~~ | ~~**Spreaker Web 埋め込み**~~ | ~~実装済み~~ | ~~完了~~ | |
| 15 | **Podigee Web 埋め込み** | playerjs.io 準拠。setCurrentTime()/getCurrentTime()。標準プロトコル | 低 | ニッチだが実装容易 |
| ~~16~~ | ~~**汎用音声/Podcast 再生 (AudioProvider)**~~ | ~~実装済み~~ | ~~完了~~ | |
| 17 | **Spotify エピソード一覧 API** | Spotify Web API (Client Credentials) で `GET /v1/shows/{id}/episodes` → エピソード一覧表示。PodcastEpisodeList と同等の UI | 中 | Spotify API が Premium 必須になったため保留。無料化待ち or 代替手段検討 |

## 明示的に除外

| 機能 | 理由 | 日付 |
|------|------|------|
| **Zaps (NIP-57)** | 「現状実装すべきでない」 | 2026-03-15 |
| **NIP-46 Nostr Connect** | nostr-login が担っている | 2026-03-15 |

## 実装済み (参考)

- NIP-05 検証 + コメント/プロフィール表示
- リレー管理 (kind:10002 + kind:3 フォールバック + /settings UI)
- プロフィールページ (/profile/{npub|nprofile})
- NIP-19 ルーティング (npub/nprofile/nevent/note/ncontent)
- カスタム ncontent TLV エンコード
- 通知フィード (返信/リアクション/メンション/フォロー + /notifications)
- Follow/Unfollow (kind:3 content 保全)
- ブックマーク (kind:10003 + NIP-73 i タグ拡張)
- ミュートリスト (kind:10000, NIP-44 暗号化)
- 通知 WoT フィルタ (all/follows/wot)
- PWA (Service Worker + manifest.webmanifest)
- Code splitting 最適化
- i18n 拡張性改善 (locale レジストリ + LanguageSwitcher ドロップダウン)
- 開発者ツール (設定ページ: キャッシュ統計/SW状態/ストレージ管理/デバッグ情報コピー)
- 確認モーダル (Follow/Unfollow/Mute/ワード操作に件数変化表示)
- フォロー一覧展開 (プロフィールページ)
- ヘッダーアバター→プロフィールリンク
- SoundCloud Web 埋め込み (Widget API + 再生同期)
- URL パーサー修正 (Spotify intl-{locale}, SoundCloud m., ID エンコーディング)
- Vimeo Web 埋め込み (Player.js SDK + 再生同期)
- Mixcloud Web 埋め込み (Widget API + 再生同期 + seek)
- cached-nostr SWR レイヤー (DB→リレー並列取得 + 自動永続化)
- 通知バグ修正 (再購読データ消失, 無限ループ, since パラメータ, ターゲットコメント表示)
- Spotify SPA ナビゲーション再描画修正
- Spreaker Web 埋め込み (Widget API + ポーリング再生同期 + seek)
- 汎用音声/Podcast 再生 (AudioProvider + PodcastProvider + RSS パース + NIP-B0 ブックマーク + 音声メタデータ解析)
- 共有モーダル (時間付きリンクコピー + Nostr 投稿)
- URL 時間パラメータ対応 (?t= 初期シーク + 入力 URL からの時間抽出)
- SoundCloud/Mixcloud i タグ正規化 (platform:type:id 形式統一)
- ホームページ UI 刷新 (チップ式入力例 + プレースホルダーローテーション)
