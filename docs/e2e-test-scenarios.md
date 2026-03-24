# E2E テストシナリオ一覧

> 未カバーの E2E テストシナリオ。チェックボックスで実装管理。
> 既存テスト (131 件) は含まない。

---

## 1. URL 入力 & コンテンツ解決

### 1A. Spotify URL バリエーション

- [ ] `open.spotify.com/intl-ja/track/xxx` (ロケール prefix) → `/spotify/track/xxx`
- [ ] `open.spotify.com/intl-fr_FR/episode/xxx` → `/spotify/episode/xxx`
- [ ] `spotify:episode:xxx` (URI 形式) → `/spotify/episode/xxx`
- [ ] `open.spotify.com/album/xxx` → `/resolve/...`
- [ ] `open.spotify.com/artist/xxx` → `/resolve/...`
- [ ] `open.spotify.com/embed/track/xxx` → 正しく解決

### 1B. YouTube URL バリエーション

- [ ] `youtube.com/shorts/xxx` → `/youtube/video/xxx`
- [ ] `music.youtube.com/watch?v=xxx` → `/youtube/video/xxx`
- [ ] `youtube.com/embed/xxx` → `/youtube/video/xxx`
- [ ] `m.youtube.com/watch?v=xxx` (モバイル) → `/youtube/video/xxx`
- [ ] `youtube.com/playlist?list=PLxxx` → `/youtube/playlist/PLxxx`
- [ ] `youtube.com/channel/UCxxx` → `/youtube/channel/UCxxx`
- [ ] `youtube.com/watch?v=xxx&t=90` (タイムスタンプ付き) → `/youtube/video/xxx`
- [ ] `youtube.com/watch?v=xxx&list=PLyyy` → video 優先 `/youtube/video/xxx`

### 1C. その他プロバイダー URL

- [ ] `player.vimeo.com/video/xxx` (embed URL) → `/vimeo/video/xxx`
- [ ] `m.soundcloud.com/user/track` (モバイル) → `/soundcloud/track/...`
- [ ] `soundcloud.com/user/sets/playlist` → sets 拒否 → `/resolve/...`
- [ ] `spreaker.com/episode/slug--12345` (slug 付き) → `/spreaker/episode/12345`
- [ ] `embed.nicovideo.jp/watch/sm9` → `/niconico/video/sm9`
- [ ] `sp.nicovideo.jp/watch/sm9` (スマホ版) → `/niconico/video/sm9`
- [ ] `nicovideo.jp/watch/so12345` (so prefix) → `/niconico/video/so12345`
- [ ] `podbean.com/ew/pb-xxx` (embed URL) → `/podbean/episode/pb-xxx`
- [ ] `example.com/track.opus` → `/audio/track/...`
- [ ] `example.com/track.flac` → `/audio/track/...`
- [ ] `example.com/track.aac` → `/audio/track/...`
- [ ] `example.com/track.wav` → `/audio/track/...`
- [ ] `example.com/track.wma` → `/audio/track/...`
- [ ] `example.com/feed.atom` → `/podcast/feed/...`
- [ ] `example.com/feed.json` → `/podcast/feed/...`

### 1D. 危険・不正 URL

- [ ] `javascript:alert(1)` → "Unsupported URL"
- [ ] `data:text/html,...` → "Unsupported URL"
- [ ] `file:///etc/passwd` → "Unsupported URL"
- [ ] `ftp://example.com/file` → "Unsupported URL"
- [ ] URL にユニコード含有 → 正しくエンコード → 遷移
- [ ] URL 2 つ貼り付け (スペース区切り) → 最初のみ
- [ ] 非常に長い URL (2000 文字) → クラッシュなし
- [ ] URL にフラグメント `#t=90` 付き → フラグメント除去して解決

### 1E. フォーム操作

- [ ] 空文字 → Go ボタン disabled
- [ ] スペースのみ → Go ボタン disabled
- [ ] 前後スペース付き URL → trim して正常遷移
- [ ] `open.spotify.com/track/` (ID なし) → "Unsupported URL"
- [ ] Enter キー送信
- [ ] Go ボタンクリック送信

### 1F. サンプルチップ (未テストのプロバイダー)

- [ ] Vimeo チップクリック → `/vimeo/video/...`
- [ ] SoundCloud チップクリック → `/soundcloud/track/...`
- [ ] Mixcloud チップクリック → `/mixcloud/show/...`
- [ ] Spreaker チップクリック → `/spreaker/episode/...`
- [ ] Audio チップクリック → `/audio/track/...`

### 1G. Resolve ページ

- [ ] 未知 URL → resolve ページ → ローディング → エラー
- [ ] 未知 URL → resolve → RSS 発見 → フィードページリダイレクト
- [ ] 未知 URL → resolve → RSS なし → ドメインルートフォールバック
- [ ] 解決済み URL 再入力 → 同じページに遷移
- [ ] resolve タイムアウト → "Failed to resolve" エラー

### 1H. 拡張専用プロバイダー

- [ ] Netflix URL → "Install extension" プロンプト
- [ ] Prime Video URL → "Install extension" プロンプト
- [ ] Disney+ URL → "Install extension" プロンプト
- [ ] Apple Music URL → "Install extension" プロンプト
- [ ] Fountain.fm URL → "Install extension" プロンプト
- [ ] AbemaTV URL → "Install extension" プロンプト
- [ ] TVer URL → "Install extension" プロンプト
- [ ] U-NEXT URL → "Install extension" プロンプト
- [ ] 拡張プロバイダー → Chrome install リンク表示
- [ ] 拡張プロバイダー → Firefox install リンク表示

---

## 2. コメント投稿

### 2A. 基本投稿フロー

- [ ] テキスト入力 → 送信 → relay round-trip 後にコメント表示
- [ ] 送信後 textarea クリア (`value=""`)
- [ ] 送信中 flying 状態 (400ms plane アニメーション)
- [ ] 送信中 sending 状態 (スピナー)
- [ ] 送信中ボタン disabled (`busy`)
- [ ] Ctrl+Enter で送信
- [ ] Cmd+Enter で送信 (Mac)
- [ ] Shift+Enter → 改行挿入 (送信しない)
- [ ] 空テキスト → ボタン disabled
- [ ] スペースのみ → ボタン disabled
- [ ] ダブルクリック → 二重送信防止 (`flying`/`sending`)

### 2B. タイムスタンプ付きコメント

- [ ] 「Timed」ボタン選択 → position タグ付き `['position', 'N']`
- [ ] 「General」ボタン選択 → position タグなし
- [ ] 再生位置 0 → Timed ボタン非表示
- [ ] 再生位置 > 0 → Timed ボタン表示
- [ ] Timed/General 切り替え → 状態反映
- [ ] position 0:00 のコメント → "0:00" バッジ表示
- [ ] position 99:59 → 正しく "99:59" 表示
- [ ] 再生停止中 → Timed ボタン表示可否 (position > 0 なら表示)

### 2C. 特殊コンテンツ付きコメント

- [ ] `#nostr` ハッシュタグ → `t` タグ抽出
- [ ] `nostr:npub1...` メンション → `p` タグ抽出
- [ ] `nostr:note1...` 引用 → `e` タグ抽出
- [ ] カスタム絵文字 `:custom:` → emoji タグ `['emoji', 'custom', '{url}']`
- [ ] CW トグル ON + 理由 → `['content-warning', '{reason}']`
- [ ] CW トグル ON + 理由空 → `['content-warning', '']`
- [ ] URL 含有コメント → テキストのまま content に入る
- [ ] 複数ハッシュタグ → 各 `t` タグ
- [ ] 複数メンション → 各 `p` タグ (重複排除)
- [ ] ハッシュタグ + メンション + 絵文字混在 → 全タグ正しく生成

### 2D. エラーケース

- [ ] `nsec1...` 含有 → 送信ブロック + `contains_private_key` エラートースト
- [ ] 全リレー拒否 → `comment_failed` エラートースト
- [ ] Read-only ログイン → signEvent 不在 → エラー
- [ ] ネットワーク切断中 → 送信失敗 → エラートースト
- [ ] 送信失敗後 → テキスト保持 (消えない) → 再送可能

### 2E. オートコンプリート

- [ ] `@` 入力 → メンション候補表示 (フォロー + スレッド参加者)
- [ ] `@abc` → 名前/npub にマッチする候補のみ
- [ ] 矢印キー ↑↓ → 候補ハイライト移動
- [ ] Enter → 候補確定 + `nostr:npub...` 挿入
- [ ] Tab → 候補確定
- [ ] Escape → オートコンプリート閉じ
- [ ] `:` 入力 → 絵文字候補表示 (最大 8 件)
- [ ] `:smile` → マッチする絵文字候補
- [ ] 絵文字選択 → `:shortcode: ` 挿入 + emojiTags に URL 追加
- [ ] `#` 入力 → ハッシュタグ候補 (NowPlaying, Music 等)
- [ ] `#nos` → フィルタされた候補
- [ ] `@` 削除 → オートコンプリート閉じ → `suppressUntilNewChar`
- [ ] 再入力で候補再表示
- [ ] NIP-05 表示 (メンション候補の右寄せグレー)
- [ ] メンション候補にプロフィール画像表示
- [ ] 候補 0 件 → ドロップダウン非表示

---

## 3. コメント表示 & レンダリング

### 3A. テキストレンダリング

- [ ] URL 含有コメント → 自動リンク化 `<a target="_blank">`
- [ ] URL 末尾のピリオド除去 (`https://example.com.` → `.` 除去)
- [ ] URL 末尾の括弧バランス保持 (Wikipedia 等)
- [ ] 改行含有コメント → 改行表示 (`whitespace-pre-wrap`)
- [ ] 長文 (1000 文字+) → 折り返し (`break-words`)
- [ ] 絵文字のみのコメント → 正常表示
- [ ] 空白のみのコメント → 表示可否
- [ ] URL のみのコメント → リンク化

### 3B. nostr: URI レンダリング

- [ ] `nostr:npub1...` → `@表示名` リンク → `/profile/{uri}`
- [ ] `nostr:nprofile1...` → `@表示名` リンク (relay hint 付き)
- [ ] `nostr:note1...` → QuoteCard 埋め込み (イベント fetch)
- [ ] `nostr:nevent1...` → QuoteCard 埋め込み (relay hint 付き)
- [ ] `nostr:ncontent1...` → コンテンツリンク `/{platform}/{type}/{id}`
- [ ] `nostr:ncontent1...` 不正値 → プレーンテキスト
- [ ] 不正な `nostr:abc` → プレーンテキスト
- [ ] QuoteCard 内の `nostr:note` → 再帰 fetch + 表示
- [ ] ncontent → プロバイダー displayLabel 表示

### 3C. 絵文字 & ハッシュタグ

- [ ] カスタム絵文字 `:custom:` → `<img>` 表示
- [ ] 未知絵文字 `:unknown:` → テキスト表示
- [ ] `#nostr` → アクセントカラー `<span>`
- [ ] `#aaa...` (64 文字 hex) → ハッシュタグ除外 → プレーン
- [ ] `#123` (数字のみ) → ハッシュタグ除外 → プレーン
- [ ] 絵文字画像 URL の sanitize (`sanitizeImageUrl()` → https のみ)

### 3D. CW (コンテンツ警告)

- [ ] CW 付きコメント → ぼかし/非表示 + "Show" ボタン
- [ ] "Show" クリック → コンテンツ表示 (`revealedCWIds` 追加)
- [ ] "Hide" クリック → 再非表示 (`revealedCWIds` 削除)
- [ ] CW 理由テキスト表示
- [ ] CW 内の URL/メンション → "Show" 後に表示

### 3E. コメントカード要素

- [ ] timed コメントの位置バッジ (青 `mm:ss`)
- [ ] 位置バッジクリック → `resonote:seek` → プレイヤーシーク
- [ ] 自分のコメント → 削除アイコン表示
- [ ] 他者のコメント → 削除アイコン非表示
- [ ] 自分のコメント → ミュートアイコン非表示
- [ ] 他者のコメント → ミュートアイコン表示 (`!isOwn && canMute`)
- [ ] アバタークリック → プロフィールページ遷移
- [ ] 表示名クリック → プロフィールページ遷移
- [ ] タイムスタンプ → 相対時刻 ("2h ago", "just now")
- [ ] 非常に古いコメント → "2 years ago" 等
- [ ] プロフィール未取得 → pubkey 短縮表示
- [ ] プロフィール取得完了 → 名前 + アバター更新
- [ ] コメント 0 件 → "No comments yet" メッセージ

---

## 4. コメント順序 & ソート

- [ ] timed 3 件 (0:30, 1:00, 1:30) → 時刻昇順
- [ ] timed 逆順到着 (1:30 → 0:30) → 正しくソート
- [ ] general 3 件 → 新しい順 (created_at 降順)
- [ ] general 逆順到着 → 正しくソート
- [ ] timed + general 混在 → 2 セクションに分離
- [ ] リプライは timed/general に含まれない (`replyMap`)
- [ ] 自分の投稿 → relay 経由で正しい位置に表示
- [ ] 他者の timed コメント受信 → 正しい位置に挿入
- [ ] 他者の general コメント受信 → 先頭に表示
- [ ] 同一 position の timed 2 件 → created_at で副次ソート
- [ ] position = null → general, position = 0 → timed
- [ ] 多数 timed コメント → 再生位置に自動スクロール (`findNearestTimedIndex`)
- [ ] ユーザーが手動スクロール → "Jump to Now" ボタン表示
- [ ] "Jump to Now" クリック → 現在位置にスクロール
- [ ] フィルタ切り替え後もソート維持

---

## 5. リアクション

- [ ] ❤️ ボタンクリック → kind:7 `+` 送信
- [ ] リアクション成功 → `reaction_sent` トースト
- [ ] リアクション失敗 → `reaction_failed` エラートースト
- [ ] 絵文字ピッカー → カスタム絵文字選択 → kind:7 + emoji タグ
- [ ] リアクション後 → カウント +1
- [ ] 他者のリアクション受信 → カウント +1 (forward subscription)
- [ ] 同一コメントに複数の異なる絵文字 → 全表示 + 各カウント
- [ ] リアクション済み → ❤️ filled 状態 (`myReaction`)
- [ ] 送信中 → ボタン disabled (`acting`)
- [ ] 自分のコメントにリアクション → 許可
- [ ] 未ログイン → リアクションボタン非表示
- [ ] 絵文字ピッカー排他制御 → 1 つだけ開く (`activePopoverId`)
- [ ] 絵文字ピッカー外クリック → 閉じる
- [ ] カスタム絵文字リアクション → 画像表示 (URL → `<img>`)
- [ ] リアクション数 0 → カウント非表示
- [ ] ミュート済みユーザーのリアクション → 非表示

---

## 6. リプライ

- [ ] リプライアイコンクリック → インラインフォーム表示
- [ ] リプライテキスト入力 → 送信 → `e`/`p` タグ付き kind:1111
- [ ] リプライ成功 → `reply_sent` トースト
- [ ] リプライ失敗 → `reply_failed` エラートースト + テキスト保持
- [ ] キャンセルボタン → フォーム閉じ (`replyTarget = null`)
- [ ] リプライへのリプライ (ネスト) → 子リプライの `e`/`p` タグ
- [ ] リプライ送信中 → ボタン disabled (`replySending`)
- [ ] リプライが親コメントの下にスレッド表示 (`replyMap`)
- [ ] 親コメント展開 → リプライ一覧表示
- [ ] timed コメントへのリプライ → 同じ position 継承
- [ ] リプライの CW 付き → `content-warning` タグ
- [ ] リプライ内のメンション → 追加 `p` タグ
- [ ] 他者のリプライ受信 → スレッドに追加
- [ ] 引用 (quote) ボタン → textarea にプリフィル (`insertQuote`)
- [ ] 孤児リプライ → プレースホルダー → fetch → loading → success
- [ ] 孤児リプライ → プレースホルダー → fetch → not-found
- [ ] 孤児リプライ → プレースホルダー → fetch → deleted
- [ ] 深いネストリプライ (5 段) → 正しくインデント

---

## 7. コメント削除

- [ ] 削除アイコンクリック → ConfirmDialog (danger variant, 赤ボタン)
- [ ] 確認 → kind:5 送信 → コメント消失 (`deletedIds`)
- [ ] 削除成功 → `delete_sent` トースト
- [ ] 削除失敗 → `delete_failed` エラートースト + コメント残留
- [ ] キャンセル → アクション未実行
- [ ] Escape → キャンセル
- [ ] 削除中スピナー表示 (`acting`)
- [ ] 他者の kind:5 受信 → そのコメント消失
- [ ] 不正な kind:5 (他者のコメント) → 無視 (pubkey 検証)
- [ ] 削除後 → リアクションカウントも消失 (`rebuildReactionIndex`)
- [ ] 削除後 → IndexedDB キャッシュも削除 (`purgeDeletedFromCache`)
- [ ] 削除後 → `invalidateFetchByIdCache` (キャッシュ再汚染防止)
- [ ] 削除後 → リプライのスレッドから消失
- [ ] 削除されたコメントへのリプライ → 孤児プレースホルダー "Deleted"

---

## 8. ブックマーク

- [ ] コンテンツページ → ブックマーク追加 → kind:10003 + ボタン ★
- [ ] ブックマーク再クリック → 削除 → kind:10003 更新 + ボタン ☆
- [ ] ブックマーク中 → ボタン disabled (`bookmarkBusy`)
- [ ] ブックマーク追加エラー → ボタン再有効化 (silent)
- [ ] `/bookmarks` → コンテンツブックマーク表示 (⭐ + i-tag 値)
- [ ] `/bookmarks` → コメントブックマーク表示 (✉️ + 短縮テキスト)
- [ ] ブックマーク一覧 → エントリクリック → コンテンツ遷移
- [ ] ブックマーク一覧 → ゴミ箱クリック → 即削除 (確認なし)
- [ ] 削除中 → ゴミ箱ボタン disabled
- [ ] `/bookmarks` 空 → `bookmark.empty` メッセージ
- [ ] `/bookmarks` 未ログイン → ログインプロンプト
- [ ] `/bookmarks` ローディング → スピナー
- [ ] ブックマーク後 → ページ遷移 → 戻る → ★ 維持
- [ ] Podcast エピソードのブックマーク → i-tag: `podcast:guid:xxx`
- [ ] YouTube 動画のブックマーク → i-tag: `youtube:video:xxx`
- [ ] Audio 直 URL のブックマーク → i-tag: `audio:track:xxx`
- [ ] ブックマーク hint 表示 (説明/URL) → 下段グレー
- [ ] コメントブックマーク → 削除ボタン非表示
- [ ] ブックマーク追加 → `/bookmarks` に即反映
- [ ] ブックマーク削除 → `/bookmarks` から即消失
- [ ] ブックマーク → ログアウト → 再ログイン → ★ 維持 (relay 取得)

---

## 9. 共有

- [ ] 共有ボタンクリック → メニュー表示 (3 アクション)
- [ ] "Copy link" → クリップボードにコピー (`navigator.clipboard.writeText`)
- [ ] コピー成功 → ✓ 表示 (2 秒)
- [ ] "Copy timed link" (再生中) → `?t=` 付き URL コピー
- [ ] timed link 成功 → ✓ 表示 (2 秒)
- [ ] 再生位置 0 → timed link 非表示
- [ ] "Post to Nostr" (ログイン時のみ表示)
- [ ] Post → NoteInput → テキスト入力 → 送信 → kind:1 share
- [ ] Post → プリフィル内容 (openUrl + pageUrl)
- [ ] Post → 送信中スピナー
- [ ] Post → 成功 → モーダル閉じ
- [ ] Post → キャンセルボタン → モーダル閉じ
- [ ] Escape → モーダル閉じ
- [ ] 共有メニュー外クリック → 閉じ
- [ ] 未ログイン → "Post to Nostr" 非表示 (2 アクションのみ)
- [ ] クリップボード API 失敗 → サイレントログ (トーストなし)
- [ ] コピーした URL を新タブで開く → 同じコンテンツページ
- [ ] timed link を新タブで開く → `?t=` でシーク
- [ ] 共有 Nostr 投稿 → ncontent1 URI 含む

---

## 10. フォロー / アンフォロー

- [ ] プロフィールページ → "Follow" ボタン (accent)
- [ ] クリック → kind:3 publish → follows リスト更新
- [ ] フォロー後 → ボタン "Unfollow" に変化
- [ ] "Unfollow" クリック → ConfirmDialog → kind:3 更新
- [ ] フォロー中ローディング → ボタン disabled (`followActing`)
- [ ] 自分のプロフィール → ボタン非表示 (`isOwnProfile`)
- [ ] フォロー数表示 (`followsCount`)
- [ ] フォロー数クリック → フォローリスト展開 (max-h-64 スクロール)
- [ ] フォローリスト内のユーザークリック → プロフィール遷移
- [ ] フォロー数 0 → クリック無効 (disabled)
- [ ] フォロー → コメントフィルタ "Follows" に反映
- [ ] アンフォロー → "Follows" フィルタから除外
- [ ] 未ログイン → フォローボタン非表示
- [ ] フォロー失敗 → ボタン再有効化
- [ ] フォロー → メンション候補に表示

---

## 11. ミュート

- [ ] コメントカードのミュートアイコン → ConfirmDialog (ミュート数表示)
- [ ] 確認 → kind:10000 publish → ミュートリスト更新
- [ ] ミュート後 → そのユーザーのコメント全非表示
- [ ] ミュート後 → そのユーザーのリアクション全非表示
- [ ] 設定ページ → ミュートユーザー一覧 (アバター + 名前)
- [ ] "Unmute" → ConfirmDialog → kind:10000 更新
- [ ] 解除後 → コメント再表示
- [ ] 解除後 → リアクション再表示
- [ ] ミュートワード一覧 (ワード + × ボタン)
- [ ] ミュートワード削除 → ConfirmDialog → 削除
- [ ] NIP-44 非対応 → 警告表示 (`nip44Supported === false`)
- [ ] NIP-44 対応 → 暗号化ミュートリスト publish
- [ ] 自分自身のミュート → 不可 (`isOwn`)
- [ ] ミュート → 通知からも除外
- [ ] 未ログイン → ミュートアイコン非表示
- [ ] ミュートはサイレント完了 (トーストなし)
- [ ] ミュートワードにマッチするコメント → 非表示

---

## 12. リレー設定

### 12A. リレーリスト表示

- [ ] ログイン後 → kind:10002 取得 → URL 一覧表示
- [ ] 接続状態ドット: 緑 (CONNECTED)
- [ ] 接続状態ドット: 黄 (CONNECTING)
- [ ] 接続状態ドット: 赤 (DISCONNECTED)
- [ ] リレー URL の truncation + ツールチップ

### 12B. リレー追加

- [ ] URL 入力 → Enter → リスト追加
- [ ] 不正 URL (`http://`) → バリデーションエラー (`invalid_url`)
- [ ] 重複 URL → バリデーションエラー
- [ ] 空 URL → バリデーション拒否
- [ ] 追加後 → フォームクリア

### 12C. リレー操作

- [ ] Read トグル on/off
- [ ] Write トグル on/off
- [ ] 削除ボタン → リストから除去
- [ ] 変更 → dirty → 保存ボタン有効化

### 12D. 保存

- [ ] 保存 → kind:10002 publish → relay にイベント到達
- [ ] 保存成功 → ✓ 表示 (3 秒)
- [ ] 保存中 → ボタン disabled
- [ ] "Setup defaults" ボタン (リスト未設定時)
- [ ] "Not found" エラー → "Setup defaults" 表示

### 12E. リアルタイム同期

- [ ] relay から kind:10002 受信 → UI 更新
- [ ] 編集中 (dirty) に relay 更新 → 上書きなし
- [ ] 保存 → 自己受信 → dirty リセット

### 12F. リレー × 他機能

- [ ] リレー追加 → 接続 → そのリレーからコメント受信
- [ ] リレー削除 → 切断 → イベント停止
- [ ] Read 無効 → read 停止
- [ ] Write 無効 → write 停止
- [ ] 全リレー Write 無効 → コメント送信失敗
- [ ] リレー接続状態変化 → ヘッダーのリレーステータス更新
- [ ] 全リレー切断 → 琥珀色バナー表示
- [ ] 全リレー復帰 → バナー消失
- [ ] "Setup defaults" → 4 リレー → 接続開始 → 全ドット緑

---

## 13. 通知

### 13A. 通知ベル & ポップオーバー

- [ ] 通知ベル → 未読バッジ表示
- [ ] ベルクリック → ポップオーバー (最新通知)
- [ ] "View all" → `/notifications` 遷移

### 13B. 通知一覧

- [ ] リアクション通知 → ❤️ アイコン + アクター名
- [ ] リプライ通知 → 📝 アイコン + アクター名
- [ ] メンション通知 → @ アイコン + アクター名
- [ ] フォローコメント通知 → アイコン + アクター名
- [ ] 未読通知 → 青ドット + 背景色
- [ ] 既読通知 → ドットなし
- [ ] カスタム絵文字リアクション → 画像表示
- [ ] コメントプレビュー (返信元) → italic
- [ ] コンテンツリンク "View content"
- [ ] タイムスタンプ (相対時刻)

### 13C. 通知操作

- [ ] "Mark all read" → 全未読消失
- [ ] フィルタ: All → 全通知
- [ ] フィルタ: Replies → リプライのみ
- [ ] フィルタ: Reactions → リアクションのみ
- [ ] フィルタ: Mentions → メンションのみ
- [ ] "Load More" → 追加読み込み

### 13D. 通知遷移

- [ ] 通知クリック → コンテンツページ遷移
- [ ] アクターアバタークリック → プロフィール遷移

### 13E. 通知エッジケース

- [ ] 通知 0 件 → 空状態 (`notification.empty`)
- [ ] 未ログイン → ログインプロンプト
- [ ] 自分の操作は通知に出ない
- [ ] 他者リアクション受信 → リアルタイム通知追加
- [ ] 他者リプライ受信 → リアルタイム通知追加
- [ ] "Mark all read" → 新通知 → 再び未読表示
- [ ] ミュート済みユーザーの通知 → 非表示

---

## 14. プロフィール

- [ ] 自分のプロフィールページ → 表示名 + アバター
- [ ] 他者のプロフィールページ → kind:0 fetch → 表示
- [ ] NIP-05 認証バッジ (✓)
- [ ] bio 表示 (改行保持 `pre-wrap`)
- [ ] bio 内の URL → リンク化
- [ ] フォロー/ミュートボタン表示 (他者のみ)
- [ ] 自分のプロフィール → ボタン非表示
- [ ] コメント一覧表示 (そのユーザーの投稿)
- [ ] コメントカード → コンテンツリンク (i-tag → ルート)
- [ ] "Load More" → 追加読み込み
- [ ] ローディング中 → disabled
- [ ] コメント 0 件 → "This user has no comments"
- [ ] 存在しない pubkey → "No profile found" + home リンク
- [ ] プロフィール画像なし → デフォルトアバター
- [ ] 長い表示名 → truncation
- [ ] NIP-05 長い → truncation
- [ ] コメントのアバタークリック → プロフィール遷移
- [ ] コメント内メンションクリック → プロフィール遷移
- [ ] 通知のアクタークリック → プロフィール遷移
- [ ] プロフィール画像の sanitize (`sanitizeImageUrl()`)
- [ ] プロフィールページからの戻る → 前ページ
- [ ] プロフィール → コンテンツ → back → プロフィール

---

## 15. リアルタイムイベント受信 (他者の操作)

- [ ] 他者のコメント受信 → 一覧に追加
- [ ] 他者の timed コメント → 正しい位置に挿入 (position ソート)
- [ ] 他者の general コメント → 先頭に追加 (created_at 降順)
- [ ] 他者のリアクション受信 → カウント更新 (`addReaction`)
- [ ] 他者のリプライ受信 → スレッドに追加 (`replyMap`)
- [ ] 他者の削除 (kind:5) 受信 → コメント消失 (`deletedIds`)
- [ ] 他者の kind:10002 受信 → 設定ページ更新 (`useCachedLatest`)
- [ ] 他者の kind:0 (プロフィール) 更新 → アバター/名前更新
- [ ] 同一イベント複数リレー → 重複排除 (`commentIds` Set)
- [ ] 不正署名イベント → 拒否 (verifier)
- [ ] 不正削除 (他者のコメントの kind:5) → 無視 (pubkey 検証)
- [ ] オフライン復帰 → 取りこぼし取得 (backward refetch)
- [ ] 削除 reconcile (オフライン中の kind:5) → `startDeletionReconcile`
- [ ] relay 再接続 → サブスクリプション再開
- [ ] プロフィール遅延読み込み: 未知 pubkey → `fetchProfiles`
- [ ] プロフィール一括取得 (並列 fetch)
- [ ] プロフィール取得失敗 → フォールバック維持
- [ ] イベント受信 → IndexedDB キャッシュ保存
- [ ] cache-then-relay: IDB から即時表示 → relay で更新
- [ ] 新コメント受信時 textarea 内容保持 (リセットしない)
- [ ] 編集中のリレー設定 → relay 更新 → 上書きなし
- [ ] `addSubscription()` → マージ購読 (追加タグの並行)
- [ ] 未来タイムスタンプのイベント → 正常処理
- [ ] created_at = 0 のイベント → 最古として処理

---

## 16. コメントフィルタ

- [ ] "All" フィルタ → 全コメント表示
- [ ] "Follows" フィルタ → フォロー済みのみ
- [ ] "WoT" フィルタ → 2-hop ネットワークのみ
- [ ] 未ログイン → フィルタバー非表示
- [ ] Follows 0 人 → "Follows" 空状態メッセージ
- [ ] WoT 未構築 → "Building..." + ユーザー数表示
- [ ] WoT 構築完了 → "N users | Updated X ago" + リフレッシュボタン
- [ ] WoT リフレッシュボタン → 再計算
- [ ] フィルタ切り替え → リアクションも連動
- [ ] フィルタ切り替え → スクロール位置リセット
- [ ] フォロー追加 → "Follows" に即反映
- [ ] フィルタ状態はページ遷移で維持されない

---

## 17. ログイン / 認証状態

- [ ] 未ログイン → "Login with Nostr" ボタン
- [ ] ログインクリック → nostr-login ダイアログ (`launch()`)
- [ ] ログイン成功 → UI 更新 (アバター + 名前)
- [ ] ログイン → コメントフォーム表示
- [ ] ログイン → ブックマークボタン表示
- [ ] ログイン → フィルタバー表示
- [ ] ログイン → 通知ベル表示
- [ ] ログアウト → "Login" ボタン復帰
- [ ] ログアウト → コメントフォーム消失 → ログインプロンプト
- [ ] ログアウト → フィルタバー消失
- [ ] ログアウト → 通知ベル消失
- [ ] ログアウト → ブックマークボタン消失
- [ ] ログイン → session init (relays, follows, mute, emoji)
- [ ] ログアウト → session destroy
- [ ] ページリロード → nostr-login 再接続 → 自動ログイン
- [ ] ログイン → ログアウト → 再ログイン → 状態復元
- [ ] ページ遷移中のログイン状態維持
- [ ] Read-only ログイン (signEvent なし) → 閲覧のみ
- [ ] Read-only → コメント送信 → エラー
- [ ] Read-only → 設定ページ NIP-44 警告
- [ ] Read-only → リレーセクション表示
- [ ] ログイン中にページ遷移 → subscription 付け替え

---

## 18. Embed & プレイヤー

### 18A. embed 表示 (プラットフォーム別)

- [ ] Spotify embed 表示
- [ ] YouTube embed 表示
- [ ] Vimeo embed 表示
- [ ] SoundCloud embed 表示 (oEmbed 解決経由)
- [ ] Mixcloud embed 表示
- [ ] Spreaker embed 表示 (widget re-add)
- [ ] Niconico embed 表示
- [ ] Podbean embed 表示 (oEmbed 解決経由)
- [ ] Audio embed 表示 (HTML5 `<audio>`)

### 18B. プレイヤー操作

- [ ] `?t=90` → 1:30 にシーク (1500ms 遅延後)
- [ ] タイムスタンプバッジクリック → `resonote:seek`
- [ ] ページ遷移 → `resetPlayer()` (再生状態クリア)
- [ ] embed ローディング → ブランドアニメーション (`EmbedLoading`)
- [ ] embed タイムアウト (15-20 秒) → エラー + ソースリンク
- [ ] 再生中 250ms ごとの position 更新 (`updatePlayback`)
- [ ] SPA 遷移時 iframe cleanup → `try-catch` (`postMessage` null)

### 18C. プロバイダー固有

- [ ] Spreaker SPA 遷移 → widget 再生成 (remove + re-add)
- [ ] SoundCloud permalink → oEmbed API → embed URL (CORS proxy)
- [ ] Podbean oEmbed → embed URL 解決 (CORS proxy)
- [ ] Podbean `seekTo()` 秒単位変換 (ms → sec)
- [ ] Podbean `getDuration()` 再生前 NaN → PLAY 後取得
- [ ] Spotify `'unsafe-eval'` CSP → 正常動作
- [ ] YouTube IFrame API → 250ms ポーリング
- [ ] Audio → 再生/一時停止/プログレスバー/ボリューム

### 18D. フィード表示

- [ ] Podcast フィード → エピソード一覧 (`PodcastEpisodeList`)
- [ ] YouTube プレイリスト → 動画一覧 (`YouTubeFeedList`)
- [ ] エピソードクリック → コンテンツページ遷移
- [ ] エピソード説明文の展開/折りたたみ ("Show more"/"Show less")
- [ ] エピソード duration バッジ表示
- [ ] エピソード公開日表示
- [ ] フィードページ → コメントヒント "Select an episode"
- [ ] フィードページ → コメントフォーム非表示

### 18E. 拡張モード

- [ ] 拡張専用プロバイダー → "Install extension" プロンプト
- [ ] "Open and comment" ボタン (拡張モード)
- [ ] 拡張経由の再生位置同期 (`postMessage`)
- [ ] 拡張モード → 最小ヘッダー (`extensionMode`)

---

## 19. Podcast / Audio 固有

- [ ] RSS フィード URL → API 解決 → フィードページ (タイトル + エピソード)
- [ ] エピソード選択 → コメントページ遷移
- [ ] guid 解決後の URL 書き換え (`replaceState`)
- [ ] 音声直 URL → IDB → Nostr d タグ → API フォールバック (3 段)
- [ ] NIP-B0 ブックマーク → `rxNostr.cast()` pre-signed publish (再署名なし)
- [ ] 音声メタデータ表示 (タイトル, アーティスト)
- [ ] 音声アルバムアート表示
- [ ] 音声再生/一時停止
- [ ] 音声プログレスバードラッグ → シーク
- [ ] 音声ボリュームスライダー
- [ ] 音声再生終了 → position リセット
- [ ] エピソード description 1000 文字上限 (NIP-B0 content)
- [ ] フィード → エピソード A → コメント → 戻る → エピソード B
- [ ] YouTube フィード → 動画 A → コメント → 戻る → 動画 B

---

## 20. 設定ページ全般

- [ ] 通知フィルタ: All/Follows/WoT 切り替え
- [ ] 通知フィルタ → localStorage 保存
- [ ] リロード → フィルタ維持
- [ ] ミュートセクション表示
- [ ] 開発者ツールセクション表示
- [ ] IndexedDB 統計表示 (イベント数)
- [ ] LocalStorage クリアボタン → 設定リセット
- [ ] デバッグ情報コピー → JSON → clipboard
- [ ] 全データクリア → ConfirmDialog (danger) → IDB + LS クリア
- [ ] Service Worker ステータス表示
- [ ] 設定ページ → 戻る → 前のページ
- [ ] 設定ページ直アクセス → ログイン不要で表示
- [ ] リレーローディング表示

---

## 21. i18n / ロケール

- [ ] 言語切り替え ja → en → 全 UI テキスト英語化
- [ ] 言語切り替え en → ja → 全 UI テキスト日本語化
- [ ] 言語切り替え → localStorage 保存
- [ ] リロード → 言語設定維持
- [ ] LanguageSwitcher → ドロップダウン表示 (フラグ + 言語名)
- [ ] 選択中の言語 → ハイライト
- [ ] ドロップダウン外クリック → 閉じ
- [ ] モバイルでの言語切り替え (ハンバーガー内)
- [ ] 日時表示のロケール反映 (相対時刻テキスト)
- [ ] エラーメッセージのロケール反映
- [ ] トーストメッセージのロケール反映
- [ ] 空状態メッセージのロケール反映
- [ ] ConfirmDialog テキストのロケール反映

---

## 22. モバイル / レスポンシブ

- [ ] ハンバーガーメニュー表示 (< lg viewport)
- [ ] ハンバーガークリック → MobileOverlay 表示
- [ ] MobileOverlay 内ナビリンク → 遷移 + 閉じ
- [ ] MobileOverlay Escape → 閉じ
- [ ] MobileOverlay body scroll lock
- [ ] MobileOverlay focus trap (Tab 巡回)
- [ ] モバイル通知ベル → MobileOverlay 内
- [ ] モバイル設定リンク → MobileOverlay 内
- [ ] モバイルブックマークリンク → MobileOverlay 内
- [ ] モバイル絵文字ピッカー → MobileOverlay
- [ ] モバイルコンテンツページ → embed + コメント表示
- [ ] タブレット (768px) → ハンバーガーメニュー (< lg)
- [ ] デスクトップ (1024px+) → フルナビ
- [ ] モバイルでコメント送信
- [ ] モバイルでリアクション
- [ ] モバイルで共有メニュー
- [ ] モバイルでスクロール (タッチ)
- [ ] `aria-expanded` on ハンバーガー
- [ ] モバイルでリプライフォーム
- [ ] モバイルで ConfirmDialog

---

## 23. アクセシビリティ & キーボード

- [ ] Tab で全インタラクティブ要素巡回 + フォーカス可視
- [ ] ConfirmDialog Tab トラップ (ダイアログ内のみ)
- [ ] ConfirmDialog Escape → キャンセル
- [ ] ConfirmDialog キャンセルボタン自動フォーカス
- [ ] MobileOverlay Tab トラップ
- [ ] `role="dialog"` + `aria-modal="true"` on モーダル
- [ ] `aria-live="polite"` on トーストコンテナ
- [ ] アイコンボタンの `aria-label`
- [ ] セマンティック h1 → h2 → h3 階層
- [ ] フォーカス可視 (`:focus-visible`) 全要素
- [ ] Enter → フォーム送信
- [ ] Escape → 全モーダル/ポップオーバー閉じ
- [ ] 絵文字ピッカー Escape → 閉じ
- [ ] 共有メニュー Escape → 閉じ
- [ ] トースト `role="alert"` (エラー)
- [ ] `aria-expanded` on 展開ボタン (ハンバーガー, 言語)
- [ ] 装飾 SVG に `aria-hidden="true"`
- [ ] ローディング状態 `role="status"`

---

## 24. トースト通知

- [ ] コメント送信成功 → 緑トースト (`comment_sent`)
- [ ] コメント送信失敗 → 赤トースト (`comment_failed`)
- [ ] リアクション成功 → 緑トースト (`reaction_sent`)
- [ ] リアクション失敗 → 赤トースト (`reaction_failed`)
- [ ] 削除成功 → 緑トースト (`delete_sent`)
- [ ] 削除失敗 → 赤トースト (`delete_failed`)
- [ ] リプライ成功 → 緑トースト (`reply_sent`)
- [ ] リプライ失敗 → 赤トースト (`reply_failed`)
- [ ] nsec 検出 → 赤トースト (`contains_private_key`)
- [ ] 自動消失 (4 秒) (`TOAST_DURATION_MS`)
- [ ] 手動閉じ (× ボタン) → 即時消失
- [ ] 複数トースト → スタック表示 (最大 3)
- [ ] トースト z-index → 他要素の上に表示

---

## 25. VirtualScrollList & #153 / #154

- [ ] general コメント 20+ 件 → スクロール可能 (#153)
- [ ] コメント 0 → N 件に変化 → 全件表示 (`visibleRange` 更新)
- [ ] 100+ コメント → スムーズスクロール (virtual scroll)
- [ ] 新コメント上方挿入 → スクロール位置維持 (auto-adjust)
- [ ] `scrollToIndex()` → 指定位置へ自動スクロール
- [ ] ResizeObserver → 動的高さ追従 (height cache)
- [ ] timed + general 両セクション独立スクロール
- [ ] 再生前でも timed コメント表示 (#154)
- [ ] フィルタ切り替え → スクロール位置リセット
- [ ] 高速スクロール → 正しいレンダリング (overscan buffer)
- [ ] 1000+ コメント → FPS > 30 (パフォーマンス)

---

## 26. NIP-19 & nostr: URI

- [ ] `/note1...` → イベント fetch → コンテンツ遷移
- [ ] `/nevent1...` → イベント fetch → コンテンツ遷移 (relay hint)
- [ ] 非コメントイベント → "View content" リンク (`not_comment`)
- [ ] 不正 NIP-19 → エラー表示 (`nip19.invalid`)
- [ ] `nprofile1...` → プロフィール遷移
- [ ] ローディング中表示 ("Loading...")
- [ ] エラー → "Back to home" リンク
- [ ] `ncontent1...` URL 入力 → コンテンツ遷移 (decode → route)
- [ ] QuoteCard 内の nostr:note → 再帰 fetch
- [ ] ncontent decode → プロバイダー名 (`displayLabel`) 表示

---

## 27. セキュリティ

### 27A. XSS 防御

- [ ] コメント content に `<script>alert(1)</script>` → 無害化テキスト
- [ ] コメント content に `<img onerror=alert(1)>` → sanitize
- [ ] コメント content に `javascript:alert(1)` → リンク化しない
- [ ] プロフィール名に `<b onmouseover=alert(1)>` → 無害化
- [ ] プロフィール bio に `<script>` → 無害化
- [ ] プロフィール画像 URL に `javascript:` → `sanitizeImageUrl` 拒否
- [ ] 絵文字 URL に `data:text/html` → `sanitizeImageUrl` 拒否
- [ ] NIP-05 identifier に `<script>` → 無害化
- [ ] リレー URL に `javascript:` → wss:// バリデーション拒否
- [ ] ブックマーク hint に `<script>` → 無害化
- [ ] 通知コンテンツに `<script>` → 無害化

### 27B. 秘密鍵漏洩防止

- [ ] nsec1... をコメントに入力 → 送信ブロック
- [ ] nsec1... をリプライに入力 → 送信ブロック
- [ ] nsec1... を共有 Nostr 投稿に入力 → 送信ブロック
- [ ] 部分 nsec (58 文字未満) → 許可 (誤検出しない)

### 27C. 不正イベント

- [ ] 不正署名イベント → verifier 拒否
- [ ] 他者のコメントを偽装削除 (kind:5) → 無視
- [ ] 改ざんされた content → 署名不一致 → 拒否
- [ ] 不正な tags 構造 → graceful 処理
- [ ] SSRF 防御 (API 側 `safeFetch`)

---

## 28. マルチステップジャーニー

- [ ] 新規ユーザー: Home → チップ → 閲覧 → ログイン → コメント → リアクション → 共有 → ブックマーク
- [ ] リピーター: URL 貼り付け → コメント → 通知確認 → リプライ → プロフィール確認
- [ ] 管理者: 設定確認 → リレー調整 → ミュート確認 → dev tools
- [ ] モバイル: ハンバーガー → 設定 → 言語変更 → Home → URL → コメント
- [ ] Podcast 探索: RSS URL → フィード → エピソード A → コメント → B → コメント
- [ ] ソーシャル: コメント閲覧 → プロフィール → フォロー → Follows フィルタ → WoT
- [ ] 共有: コンテンツ → 共有 → timed link コピー → 新タブ → ?t= シーク → コメント
- [ ] 通知: ベル → ポップオーバー → View all → フィルタ → Mark read → Content
- [ ] ブックマーク: 追加 → /bookmarks → 確認 → 削除 → Content → ☆
- [ ] ミュート: コメントカード → ミュート → 確認 → 設定 → Unmute → 確認
- [ ] Read-only: ログイン → 閲覧 → 送信失敗 → 設定 → NIP-44 警告 → ログアウト
- [ ] リレー障害: 全断 → 警告バナー → 設定 → 追加 → 接続 → バナー消失
- [ ] 言語: ja → en → Settings → 全英語 → Home → 全英語 → ja に戻す
- [ ] 削除: コメント → リアクション → 削除 → ConfirmDialog → 消失 → 通知影響
- [ ] CW: CW 付きコメント → 非表示 → "Show" → 表示 → "Hide" → 非表示
- [ ] timed: 再生 → Timed コメント → 停止 → General → 再開 → 自動スクロール
- [ ] 引用: コメント → 引用ボタン → textarea プリフィル → 修正 → 送信
- [ ] フォロー一覧: プロフィール → フォロー → カウント+1 → 展開 → 確認
- [ ] ncontent: 共有投稿 → ncontent1 リンク → クリック → コンテンツ遷移 → コメント
- [ ] 複数タブ: タブ A で操作 → タブ B は独立状態

---

## 29. ブラウザ動作 & SPA

### 29A. 履歴ナビゲーション

- [ ] Home → Content A → Content B → Back → Content A
- [ ] Home → Content → Back → Home → Forward → Content
- [ ] Home → Content → Settings → Back → Content → Back → Home
- [ ] Home → Bookmarks → Content → Back → Bookmarks
- [ ] Home → Notifications → Content → Back → Notifications
- [ ] Home → Profile → Content → Back → Profile
- [ ] 10 ページ遷移 → Back 10 回 → Home
- [ ] Content A → Content B (直接, Home 経由なし) → Back → Content A
- [ ] Content → Settings → Back → Content (embed 再ロード)

### 29B. リロード

- [ ] Home リロード → 入力クリア + UI 維持
- [ ] Content リロード → embed 再ロード + URL 維持
- [ ] Settings リロード → 設定維持 (localStorage)
- [ ] Bookmarks リロード → 再取得
- [ ] Notifications リロード → 再取得
- [ ] Profile リロード → 再取得
- [ ] Content + ?t=90 リロード → 再シーク
- [ ] Content + ログイン中リロード → 再ログイン → フォーム表示
- [ ] 全ページ: リロード後 language 維持

### 29C. 直アクセス (deep link)

- [ ] `/` → Home
- [ ] `/spotify/track/xxx` → Content (SP)
- [ ] `/youtube/video/xxx` → Content (YT)
- [ ] `/vimeo/video/xxx` → Content (VM)
- [ ] `/soundcloud/track/xxx` → Content (SC)
- [ ] `/mixcloud/show/xxx` → Content (MX)
- [ ] `/spreaker/episode/xxx` → Content (SK)
- [ ] `/niconico/video/sm9` → Content (NC)
- [ ] `/podbean/episode/xxx` → Content (PB)
- [ ] `/audio/track/xxx` → Content (AU)
- [ ] `/podcast/feed/xxx` → Content (PF)
- [ ] `/settings` → Settings
- [ ] `/bookmarks` → Bookmarks (ログイン要求)
- [ ] `/notifications` → Notifications (ログイン要求)
- [ ] `/profile/npub1xxx` → Profile
- [ ] `/note1xxx` → NIP-19 解決
- [ ] `/nevent1xxx` → NIP-19 解決
- [ ] `/completely/unknown` → SPA fallback → ヘッダー表示
- [ ] `/spotify/track/xxx?t=90` → Content + シーク
- [ ] `/playbook` (prod) → 404
- [ ] `/playbook` (dev) → Playbook ページ

---

## 30. プラットフォームマトリクス

> 10 プラットフォーム (SP/YT/VM/SC/MX/SK/NC/PB/AU/PF) × 各操作

### 30A. 直接アクセス + embed 表示 (10 件)

- [ ] SP track 直アクセス → embed + Comments
- [ ] YT video 直アクセス → embed + Comments
- [ ] VM video 直アクセス → embed + Comments
- [ ] SC track 直アクセス → oEmbed → embed + Comments
- [ ] MX show 直アクセス → embed + Comments
- [ ] SK episode 直アクセス → widget + Comments
- [ ] NC video 直アクセス → embed + Comments
- [ ] PB episode 直アクセス → oEmbed → embed + Comments
- [ ] AU track 直アクセス → audio + Comments
- [ ] PF feed 直アクセス → エピソード一覧 + Comments

### 30B. ログインプロンプト (10 件)

- [ ] SP: 未ログイン → `comment-login-prompt`
- [ ] YT: 未ログイン → `comment-login-prompt`
- [ ] VM: 未ログイン → `comment-login-prompt`
- [ ] SC: 未ログイン → `comment-login-prompt`
- [ ] MX: 未ログイン → `comment-login-prompt`
- [ ] SK: 未ログイン → `comment-login-prompt`
- [ ] NC: 未ログイン → `comment-login-prompt`
- [ ] PB: 未ログイン → `comment-login-prompt`
- [ ] AU: 未ログイン → `comment-login-prompt`
- [ ] PF: フィード → コメントフォーム非表示 (ヒント表示)

### 30C. I タグ正確性 (10 件)

- [ ] SP: `I` = `spotify:track:xxx`, `K` = `spotify:track`
- [ ] YT: `I` = `youtube:video:xxx`, `K` = `youtube:video`
- [ ] VM: `I` = `vimeo:video:xxx`, `K` = `vimeo:video`
- [ ] SC: `I` = `soundcloud:track:xxx`, `K` = `soundcloud:track`
- [ ] MX: `I` = `mixcloud:show:xxx`, `K` = `mixcloud:show`
- [ ] SK: `I` = `spreaker:episode:xxx`, `K` = `spreaker:episode`
- [ ] NC: `I` = `niconico:video:xxx`, `K` = `niconico:video`
- [ ] PB: `I` = `podbean:episode:xxx`, `K` = `podbean:episode`
- [ ] AU: `I` = `audio:track:xxx`, `K` = `audio:track`
- [ ] PF: `I` = `podcast:feed:xxx`, `K` = `podcast:feed`

### 30D. ブックマーク i タグ正確性 (10 件)

- [ ] SP: ブックマーク i-tag = `spotify:track:xxx`
- [ ] YT: ブックマーク i-tag = `youtube:video:xxx`
- [ ] VM: ブックマーク i-tag = `vimeo:video:xxx`
- [ ] SC: ブックマーク i-tag = `soundcloud:track:xxx`
- [ ] MX: ブックマーク i-tag = `mixcloud:show:xxx`
- [ ] SK: ブックマーク i-tag = `spreaker:episode:xxx`
- [ ] NC: ブックマーク i-tag = `niconico:video:xxx`
- [ ] PB: ブックマーク i-tag = `podbean:episode:xxx`
- [ ] AU: ブックマーク i-tag = `audio:track:xxx`
- [ ] PF: ブックマーク i-tag = `podcast:feed:xxx`

### 30E. 共有ボタン (10 件)

- [ ] SP〜PF 各プラットフォーム: 共有ボタン表示

### 30F. リロード後 embed + URL 維持 (10 件)

- [ ] SP〜PF 各プラットフォーム: リロード → embed + URL 維持

### 30G. ?t= シーク (10 件)

- [ ] SP〜PF 各プラットフォーム: `?t=90` → 1:30 シーク

### 30H. resetPlayer on navigation (10 件)

- [ ] SP〜PF 各プラットフォーム: 別ページ遷移 → player state クリア

### 30I. embed タイムアウト → エラー (10 件)

- [ ] SP〜PF 各プラットフォーム: embed API 遮断 → タイムアウト → エラー + ソースリンク

### 30J. コンテンツ間遷移 (10 件)

- [ ] SP → YT → NC → VM → SC → MX → SK → PB → AU → PF (Home 経由)

---

## 31. 認証状態マトリクス

> (A) 未ログイン, (B) フルログイン, (C) Read-only

### 31A. コンテンツページ × 3 状態

- [ ] A: ログインプロンプト表示
- [ ] A: コメントフォーム非表示
- [ ] A: 共有ボタン表示 (コピーのみ)
- [ ] A: ブックマークボタン非表示
- [ ] A: フィルタバー非表示
- [ ] A: リアクション/削除/ミュートアイコン非表示
- [ ] B: コメントフォーム表示
- [ ] B: 共有 "Post to Nostr" 表示
- [ ] B: ブックマーク/フィルタ/リアクション表示
- [ ] B: 自分のコメント → 削除アイコン
- [ ] B: 他者のコメント → ミュートアイコン
- [ ] C: コメントフォーム表示 (textarea)
- [ ] C: 送信 → signEvent 不在 → エラー
- [ ] C: リアクション → 失敗
- [ ] C: 削除 → 失敗

### 31B. 設定ページ × 3 状態

- [ ] A: ミュート/通知フィルタ/dev tools 表示
- [ ] A: リレーセクション空 (pubkey なし)
- [ ] B: リレーリスト表示 + 追加/削除/保存 可能
- [ ] B: ミュートユーザー一覧 + Unmute
- [ ] C: リレーリスト表示 (read-only)
- [ ] C: リレー保存 → signEvent 失敗
- [ ] C: NIP-44 警告表示
- [ ] C: Unmute → 失敗

### 31C. ブックマーク/通知/プロフィール × 3 状態

- [ ] ブックマーク A: ログインプロンプト
- [ ] ブックマーク B: 一覧表示 + 操作可能
- [ ] ブックマーク C: 一覧表示 + 削除失敗
- [ ] 通知 A: ログインプロンプト
- [ ] 通知 B: 一覧 + フィルタ + Mark read
- [ ] 通知 C: 一覧 + フィルタ (Mark read は localStorage のみ)
- [ ] プロフィール A: 表示のみ (ボタン非表示)
- [ ] プロフィール B: フォロー/ミュートボタン
- [ ] プロフィール C: ボタン表示 → 操作失敗

---

## 32. データ量マトリクス

### 32A. コメント数

- [ ] 0 件 → 空状態メッセージ
- [ ] 1 件 → 表示 (スクロール不要)
- [ ] 10 件 → 全件表示
- [ ] 100 件 → virtual scroll 発動
- [ ] 1000 件 → パフォーマンス (FPS > 30)
- [ ] 0→10 件にリアルタイム増加
- [ ] 10→0 件 (全削除) → 空状態
- [ ] timed 50 + general 50 → 両セクション
- [ ] Follows フィルタ 0 マッチ → 空状態
- [ ] 各コメントに 5 リプライ → スレッド展開
- [ ] 深いネスト (5 段) → インデント
- [ ] 1 コメントに 100 リアクション → カウント
- [ ] 1 コメントに 20 種絵文字 → 全表示
- [ ] 1000 件一斉受信 → パフォーマンス

### 32B. ブックマーク数

- [ ] 0 件 → 空状態
- [ ] 1 件 → 表示
- [ ] 100 件 → スクロール
- [ ] content 50 + comment 50 → 混在

### 32C. 通知数

- [ ] 0 件 → 空状態
- [ ] 10 件 → ページネーション不要
- [ ] 100 件 → "Load More"
- [ ] reaction 50 + reply 30 + mention 20 → 混在
- [ ] 未読 10 件 → バッジ "10"
- [ ] 全既読 → バッジなし

### 32D. リレー数

- [ ] 0 → "Not found" + "Setup defaults"
- [ ] 1 → 表示
- [ ] 4 (デフォルト) → 全接続
- [ ] 10 → 多数表示
- [ ] 接続/切断混在 → 各色ドット

### 32E. フォロー数

- [ ] 0 → リスト disabled
- [ ] 1 → リスト 1 件
- [ ] 100 → リストスクロール (max-h-64)
- [ ] WoT 0 → "Building..."
- [ ] WoT 100 → "100 users"

### 32F. ミュート数

- [ ] ユーザー 0 → 空
- [ ] ユーザー 10 → 一覧スクロール
- [ ] ワード 0 → 空
- [ ] ワード 5 → 5 ワード + × ボタン

### 32G. プロフィールコメント数

- [ ] 0 → 空状態
- [ ] 1 → 表示
- [ ] 50 → "Load More"
- [ ] 100 → ページネーション 2 回

---

## 33. タイミング & 同時操作

### 33A. 送信中の状態変化

- [ ] コメント送信中に新コメント受信 → textarea 内容保持
- [ ] コメント送信中にページ遷移 → 送信完了/キャンセル
- [ ] コメント送信中にログアウト → エラーハンドリング
- [ ] リアクション送信中に対象コメント削除 → graceful
- [ ] 削除送信中にリアクション受信 → 削除優先
- [ ] ブックマーク送信中にページ遷移 → 送信完了
- [ ] リレー保存中にログアウト → エラーハンドリング
- [ ] 2 つのコメントを連続高速送信 → 順序保証

### 33B. リアルタイム受信中の操作

- [ ] スクロール中に新コメント → 位置維持 (auto-adjust)
- [ ] フィルタ切り替え中に新コメント → フィルタ適用済み
- [ ] リプライ入力中に親コメント削除 → graceful
- [ ] 絵文字ピッカー開きながら新コメント → ピッカー維持
- [ ] 共有モーダル開きながらログアウト → モーダル閉じ
- [ ] ConfirmDialog 表示中に対象コメント削除 (他者) → キャンセル
- [ ] 通知ページ表示中に新通知 → リアルタイム追加
- [ ] 設定ページ表示中にリレー接続状態変化 → ドット更新
- [ ] プロフィール表示中に kind:0 更新 → 名前更新

### 33C. 高速連続操作

- [ ] 3 件コメント連続高速送信 → 全件到達
- [ ] 5 リアクション連続高速送信 → 全件到達
- [ ] ブックマーク追加 → 即削除 → 即追加 → 最終: 追加
- [ ] フォロー → 即アンフォロー → 即フォロー → 最終: フォロー
- [ ] フィルタ All → Follows → WoT → All 高速切替 → 最終: All
- [ ] 言語 ja → en → de → ja 高速切替 → 最終: ja
- [ ] 共有メニュー開閉 5 回高速 → 安定
- [ ] ページ遷移 5 回高速 → 最終ページ正しい
- [ ] 戻る/進む 10 回高速 → 履歴正しい

### 33D. ネットワーク状態変化

- [ ] コメント送信中にネットワーク切断 → エラートースト
- [ ] ネットワーク切断 → 復帰 → 自動再接続
- [ ] 遅いリレー (2 秒遅延) → 最終的に表示
- [ ] 1 リレーダウン + 3 正常 → コメント表示
- [ ] 2 リレーダウン + 2 正常 → コメント送信成功 (50% 閾値)
- [ ] 全リレーダウン → コメント送信失敗
- [ ] 全リレーダウン → IDB キャッシュからコメント表示
- [ ] 全リレー復帰 → 警告バナー消失

---

## 34. クロスフィーチャー相互作用

### 34A. コメント × 他機能

- [ ] コメント投稿 → 他者にリアクション通知 → 通知ページで確認
- [ ] コメント投稿 → ブックマーク → /bookmarks に "Comment" タイプ
- [ ] コメント削除 → リアクションカウント消失
- [ ] コメント削除 → 通知の "In reply to" が "Deleted" に
- [ ] コメント内 nostr:npub → クリック → プロフィール → フォロー
- [ ] コメント内 nostr:note → QuoteCard → クリック → コンテンツ遷移
- [ ] コメント内 nostr:ncontent → リンク → コンテンツ遷移
- [ ] CW コメント → "Show" → メンション/URL 表示
- [ ] timed コメント → バッジクリック → シーク → 再生位置変化
- [ ] リプライ投稿 → 通知 (type:reply) → 通知ページで確認
- [ ] メンション候補 → フォロー済みが上位 + スレッド参加者含む

### 34B. リアクション × 他機能

- [ ] リアクション → 通知 (type:reaction)
- [ ] カスタム絵文字リアクション → 通知で画像表示
- [ ] リアクション → ミュート済みユーザーからは非表示
- [ ] リアクション → コメント削除後 → カウント消失

### 34C. ブックマーク × 他機能

- [ ] ブックマーク追加 → /bookmarks に表示 → クリック → 遷移
- [ ] ブックマーク追加 → リロード → ★ 維持
- [ ] /bookmarks → ゴミ箱 → コンテンツ → ☆ に変化
- [ ] ブックマーク → ログアウト → 再ログイン → ★ 維持

### 34D. フォロー × 他機能

- [ ] フォロー → "Follows" フィルタ → そのユーザーのコメント表示
- [ ] アンフォロー → "Follows" フィルタから除外
- [ ] フォロー → WoT に 2-hop ユーザー追加
- [ ] フォロー → メンション候補に表示
- [ ] フォロー → 通知フィルタ "Follows" に影響
- [ ] フォロー → プロフィール → カウント+1 → 展開 → 確認

### 34E. ミュート × 他機能

- [ ] ミュート → コメント全非表示
- [ ] ミュート → リアクション全非表示
- [ ] ミュート → 通知全非表示
- [ ] ミュート → 設定ページに表示
- [ ] 解除 → コメント/リアクション/通知再表示
- [ ] ミュートワード → コメント内テキストマッチで非表示

### 34F. リレー × 他機能

- [ ] リレー追加 → そのリレーからコメント受信
- [ ] リレー削除 → イベント停止
- [ ] 全リレー切断 → 琥珀バナー → 復帰 → 消失
- [ ] "Setup defaults" → 接続開始 → コメント受信可能

---

## 35. エラー回復 & リトライ

### 35A. 各操作の失敗 → リトライ

- [ ] コメント送信 relay 拒否 → 再送信 → 成功
- [ ] コメント送信ネットワーク切断 → 復帰後再送信 → 成功
- [ ] コメント送信 nsec 検出 → テキスト修正 → 再送信 → 成功
- [ ] リアクション relay 拒否 → 再クリック → 成功
- [ ] 削除 relay 拒否 → 再削除 → 成功
- [ ] リプライ失敗 → テキスト保持 → 再送信 → 成功
- [ ] ブックマーク追加失敗 → 再クリック → 成功
- [ ] フォロー失敗 → 再クリック → 成功
- [ ] リレー保存失敗 → 再保存 → 成功

### 35B. oEmbed / API 失敗

- [ ] SoundCloud oEmbed API タイムアウト → エラー + ソースリンク
- [ ] Podbean oEmbed API 404 → エラー + ソースリンク
- [ ] Podcast API resolve 失敗 → "Failed to resolve"
- [ ] Podcast API → RSS パースエラー → "No podcast found"
- [ ] Spotify IFrame API ロード失敗 → タイムアウト → エラー
- [ ] Audio ファイル 404 → エラー
- [ ] Audio ファイル CORS エラー → エラー

### 35C. キャッシュ不整合

- [ ] IDB にコメントあり → relay で削除済み → 表示後消失 (reconcile)
- [ ] IDB にプロフィール → relay で更新 → 名前更新
- [ ] IDB に kind:10002 → relay で更新 → 設定 UI 更新
- [ ] IDB クリア → 全データ再取得
- [ ] fetch 中に invalidateFetchByIdCache → キャッシュ書き込みスキップ

---

## 36. ConfirmDialog 全パターン

- [ ] コメント削除: danger variant → 赤ボタン → kind:5
- [ ] コメント削除 → キャンセル → アクション未実行
- [ ] コメント削除 → Escape → キャンセル
- [ ] コメント削除 → Tab トラップ (ダイアログ内のみ)
- [ ] ミュート (コメントカード): default → 確認 → kind:10000
- [ ] ミュート → キャンセル → 未実行
- [ ] Unmute (設定): 確認 → kind:10000 更新
- [ ] Unmute → キャンセル → 未実行
- [ ] ミュートワード削除: 確認 → 更新
- [ ] ミュートワード削除 → キャンセル → 未実行
- [ ] アンフォロー: 確認 → kind:3 更新
- [ ] アンフォロー → キャンセル → 未実行
- [ ] 全データクリア: danger → IDB+LS クリア
- [ ] 全データクリア → キャンセル → 未実行

---

## 37. その他

- [ ] 環境バナー (staging) → 黄色バナー表示
- [ ] 環境バナー (dev) → 赤バナー表示
- [ ] リレー全断 → 琥珀色警告バナー
- [ ] Playbook ページ (dev only) → prod で 404
- [ ] DEV シークパネル (dev only) → `import.meta.env.DEV`
- [ ] 拡張モード → 最小ヘッダー
- [ ] リレーステータス (ヘッダー) → 接続数/総数 + 色
- [ ] Spotify show ページ → "View all episodes" リンク + ペーストヒント
- [ ] 不明コンテンツ → "Unsupported content" + "Back to home" リンク
- [ ] 空 type/id セグメント → クラッシュなし

---

## 38. ロケールマトリクス

> 4 ロケール (ja, en, de, zh_cn) × 主要チェック

### 38A. ページテキスト

- [ ] ja: Home タイトル + サブタイトル
- [ ] en: Home タイトル + サブタイトル
- [ ] de: Home タイトル + サブタイトル
- [ ] zh_cn: Home タイトル + サブタイトル
- [ ] ja: "Login with Nostr" ボタン
- [ ] en: "Login with Nostr" ボタン
- [ ] de: "Login with Nostr" ボタン
- [ ] zh_cn: "Login with Nostr" ボタン
- [ ] ja: Comments 見出し
- [ ] en: Comments 見出し
- [ ] de: Comments 見出し
- [ ] zh_cn: Comments 見出し
- [ ] ja: "No comments yet"
- [ ] en: "No comments yet"
- [ ] de: "No comments yet"
- [ ] zh_cn: "No comments yet"
- [ ] ja: ログインプロンプト
- [ ] en: ログインプロンプト
- [ ] de: ログインプロンプト
- [ ] zh_cn: ログインプロンプト
- [ ] ja: 設定ページ見出し (リレー/ミュート/通知/開発者)
- [ ] en: 設定ページ見出し
- [ ] de: 設定ページ見出し
- [ ] zh_cn: 設定ページ見出し
- [ ] ja: 通知ページタイトル + フィルタ
- [ ] en: 通知ページタイトル + フィルタ
- [ ] de: 通知ページタイトル + フィルタ
- [ ] zh_cn: 通知ページタイトル + フィルタ
- [ ] ja: ブックマーク空状態
- [ ] en: ブックマーク空状態
- [ ] de: ブックマーク空状態
- [ ] zh_cn: ブックマーク空状態
- [ ] ja: プロフィール空状態
- [ ] en: プロフィール空状態
- [ ] de: プロフィール空状態
- [ ] zh_cn: プロフィール空状態
- [ ] ja: 共有メニューテキスト
- [ ] en: 共有メニューテキスト
- [ ] de: 共有メニューテキスト
- [ ] zh_cn: 共有メニューテキスト

### 38B. トーストメッセージ

- [ ] ja: コメント送信成功トースト
- [ ] en: コメント送信成功トースト
- [ ] de: コメント送信成功トースト
- [ ] zh_cn: コメント送信成功トースト
- [ ] ja: コメント送信失敗トースト
- [ ] en: コメント送信失敗トースト
- [ ] de: コメント送信失敗トースト
- [ ] zh_cn: コメント送信失敗トースト
- [ ] ja: リアクション成功トースト
- [ ] en: リアクション成功トースト
- [ ] de: リアクション成功トースト
- [ ] zh_cn: リアクション成功トースト
- [ ] ja: 削除成功トースト
- [ ] en: 削除成功トースト
- [ ] de: 削除成功トースト
- [ ] zh_cn: 削除成功トースト
- [ ] ja: リプライ成功トースト
- [ ] en: リプライ成功トースト
- [ ] de: リプライ成功トースト
- [ ] zh_cn: リプライ成功トースト
- [ ] ja: nsec 検出エラートースト
- [ ] en: nsec 検出エラートースト
- [ ] de: nsec 検出エラートースト
- [ ] zh_cn: nsec 検出エラートースト

### 38C. ConfirmDialog テキスト

- [ ] ja: 削除確認ダイアログ
- [ ] en: 削除確認ダイアログ
- [ ] de: 削除確認ダイアログ
- [ ] zh_cn: 削除確認ダイアログ
- [ ] ja: ミュート確認ダイアログ
- [ ] en: ミュート確認ダイアログ
- [ ] de: ミュート確認ダイアログ
- [ ] zh_cn: ミュート確認ダイアログ

### 38D. フィルタ・エラー

- [ ] ja: All/Follows/WoT フィルタテキスト
- [ ] en: All/Follows/WoT フィルタテキスト
- [ ] de: All/Follows/WoT フィルタテキスト
- [ ] zh_cn: All/Follows/WoT フィルタテキスト
- [ ] ja: "Unsupported content" エラー
- [ ] en: "Unsupported content" エラー
- [ ] de: "Unsupported content" エラー
- [ ] zh_cn: "Unsupported content" エラー
- [ ] ja: 相対時刻 ("2 hours ago" 相当)
- [ ] en: 相対時刻
- [ ] de: 相対時刻
- [ ] zh_cn: 相対時刻

---

## 39. ビューポートマトリクス

> モバイル (375×812), タブレット (768×1024), デスクトップ (1280×800)

### 39A. Home

- [ ] M: タイトル + URL 入力 + ハンバーガー
- [ ] M: サンプルチップ表示 + クリック
- [ ] M: Go ボタン disabled (空)
- [ ] M: URL 入力 → 遷移
- [ ] T: タイトル + ハンバーガー
- [ ] T: URL 入力 → 遷移
- [ ] D: フルナビ (言語/リレー/ブックマーク/設定/通知/ログイン)
- [ ] D: URL 入力 → 遷移

### 39B. コンテンツページ

- [ ] M: embed 表示 (レスポンシブ幅)
- [ ] M: Comments 見出し + ログインプロンプト
- [ ] M: コメント送信
- [ ] M: リアクション
- [ ] M: 共有メニュー
- [ ] M: ブックマーク
- [ ] M: スクロール (タッチ)
- [ ] M: "Jump to Now"
- [ ] M: リプライフォーム
- [ ] M: ConfirmDialog (削除)
- [ ] T: embed + コメント表示
- [ ] T: 全操作
- [ ] D: 2 カラムレイアウト (embed 左, comments 右)
- [ ] D: 絵文字ピッカー popover 位置

### 39C. 設定

- [ ] M: リレーセクション + 追加/削除
- [ ] M: ミュートセクション
- [ ] M: 通知フィルタ
- [ ] T: 全セクション表示
- [ ] D: 全セクション表示

### 39D. 通知

- [ ] M: 通知一覧 + フィルタタブ
- [ ] M: Load More
- [ ] T: 通知一覧
- [ ] D: 通知一覧

### 39E. ブックマーク

- [ ] M: ブックマーク一覧 + 削除
- [ ] T: ブックマーク一覧
- [ ] D: ブックマーク一覧

### 39F. プロフィール

- [ ] M: ヘッダー + コメント一覧
- [ ] M: フォロー/ミュートボタン
- [ ] T: 全要素
- [ ] D: 全要素

---

## 40. 追加エッジケース

### 40A. コメント内容エッジケース

- [ ] 絵文字のみのコメント (テキストなし)
- [ ] 改行のみのコメント
- [ ] 1 文字のコメント
- [ ] 非常に長い 1 行 (折り返し)
- [ ] URL のみのコメント → リンク化
- [ ] nostr:npub のみのコメント → @name リンクのみ
- [ ] nostr:note のみのコメント → QuoteCard のみ
- [ ] 複数 URL のコメント → 全リンク化
- [ ] 複数メンションのコメント → 全リンク化
- [ ] nostr:npub + URL + #tag + :emoji: 全混在
- [ ] コメント末尾の改行 → 無駄な空白なし

### 40B. プロフィールエッジケース

- [ ] 表示名なし → pubkey 短縮
- [ ] 表示名 100 文字 → truncation
- [ ] bio なし → 空
- [ ] bio 1000 文字 → overflow なし
- [ ] bio に nostr: URI → パース?
- [ ] avatar URL 404 → デフォルト表示
- [ ] NIP-05 無し → バッジなし
- [ ] NIP-05 検証失敗 → バッジなし

### 40C. リレーエッジケース

- [ ] wss:// 必須 (ws:// は拒否?)
- [ ] 非常に長いリレー URL → truncation + ツールチップ
- [ ] リレー URL に認証情報含む → 表示?
- [ ] 最後のリレーを削除 → 空リスト → "Setup defaults"
- [ ] 全 Read off → コメント受信停止
- [ ] 全 Write off → コメント送信失敗

### 40D. 通知エッジケース

- [ ] 通知からの Content リンクが無効 → graceful
- [ ] 通知のアクターが削除済みプロフィール → フォールバック表示
- [ ] 通知の対象コメントが削除済み → "Deleted" 表示
- [ ] 大量未読 (100+) → バッジ表示 ("99+")

### 40E. ブックマークエッジケース

- [ ] 同じコンテンツを 2 回ブックマーク → 重複防止
- [ ] ブックマーク中にログアウト → 状態不整合なし
- [ ] ブックマークのコンテンツが存在しない → リンク表示のみ

### 40F. 共有エッジケース

- [ ] 共有 URL のクリップボード検証 (正しいフォーマット)
- [ ] timed link の ?t= 値が現在再生位置と一致
- [ ] Nostr 投稿の content に openUrl + pageUrl
- [ ] 共有 Nostr 投稿に nsec → ブロック
- [ ] 共有メニュー → 言語切り替え → テキスト更新

### 40G. フォローエッジケース

- [ ] フォローリスト展開 → 全ユーザーにアバター表示
- [ ] フォローリスト内ユーザーが kind:0 未取得 → pubkey 短縮
- [ ] フォロー済みユーザーをミュート → follows にはいるがコメント非表示
- [ ] WoT 2-hop 計算中にフォロー追加 → 再計算

### 40H. ミュートエッジケース

- [ ] ミュート済みユーザーのコメントが CW 付き → CW + ミュート 両方適用
- [ ] ミュートワードが部分一致 → 完全一致のみ? 部分一致?
- [ ] ミュートワードに regex メタ文字 → 安全に処理
- [ ] ミュート中に対象ユーザーからリアクション → 非表示
- [ ] ミュート解除後に IDB キャッシュから再表示

### 40I. embed エッジケース

- [ ] YouTube 年齢制限コンテンツ → embed ブロック → エラー
- [ ] Vimeo 非公開動画 → embed ブロック → エラー
- [ ] SoundCloud 削除済みトラック → oEmbed 失敗 → エラー
- [ ] Niconico ログイン必要コンテンツ → embed にログインプロンプト
- [ ] Audio に非対応コーデック → 再生エラー
- [ ] embed iframe が CSP で拒否 → エラー表示

### 40J. SPA ナビゲーションエッジケース

- [ ] 高速ページ遷移 5 回 → 最終ページ正しい + 中間 subscription リーク無し
- [ ] 戻る→進む→戻る 10 回 → 履歴正しい
- [ ] Content A → Home → Content A (同じページ) → embed 再ロード
- [ ] Content → Profile → Content (back) → embed 再ロード
- [ ] deep link → SPA ナビゲーション → deep link と同じ結果

---

## 41. 追加マルチステップジャーニー

- [ ] 完全 CRUD: 投稿 → 表示 → リアクション → リプライ → 削除 → 全消失
- [ ] ソーシャルディスカバリー: コメント → avatar → profile → follow → filter → WoT → refresh
- [ ] 設定フルサイクル: リレー追加 → R/W 設定 → 保存 → コメント送信 → リレー削除 → 再保存
- [ ] 通知フルサイクル: 他者リアクション → ベルバッジ → ポップオーバー → View all → フィルタ → Mark read
- [ ] Podcast フルサイクル: RSS URL → resolve → feed → episode A → comment → back → episode B → bookmark
- [ ] 共有フルサイクル: 再生 → timed link コピー → 新タブ → ?t= シーク → Nostr 投稿 → ncontent 確認
- [ ] ミュートフルサイクル: コメントからミュート → 消失確認 → settings → unmute → 再表示確認
- [ ] 言語フルサイクル: ja → en → 全ページ確認 → de → 確認 → ja に戻す → 確認
- [ ] Read-only フルサイクル: R/O ログイン → 閲覧 → 送信失敗 → 設定 → NIP-44 警告 → relay 表示 → ログアウト
- [ ] リレー障害フルサイクル: 全断 → バナー → IDB キャッシュ表示 → 復帰 → リアルタイム再開 → バナー消失
- [ ] ブックマークフルサイクル: コンテンツ追加 → /bookmarks 確認 → エントリクリック → 遷移 → 戻る → 削除 → コンテンツ → ☆
- [ ] CW フルサイクル: CW コメント投稿 → 非表示確認 → Show → 表示 → Hide → 非表示 → 他者の CW コメント受信 → 同様
- [ ] 孤児リプライフルサイクル: リプライ表示 → 親 loading → 親 fetch → 表示 / 親 deleted → placeholder
- [ ] ncontent フルサイクル: 共有投稿 (ncontent 含む) → 他者受信 → リンクレンダリング → クリック → コンテンツ遷移
- [ ] プロフィールフルサイクル: avatar → profile → follow → comments → Load More → コンテンツリンク → 遷移 → back
- [ ] 複数プラットフォーム探索: SP → Home → YT → Home → NC → Home → PB (各 embed 正常)
- [ ] 通知 → リプライ連鎖: A コメント → B リアクション → A 通知確認 → A リプライ → B 通知確認
- [ ] 削除影響確認: コメント → リアクション 5 件 → リプライ 3 件 → 削除 → 全消失 + 通知影響
- [ ] フォロー → WoT → フィルタ: follow 5 人 → WoT 構築 → "WoT" フィルタ → 2-hop ユーザーのみ表示
- [ ] dev tools リセット: IDB クリア → LS クリア → 全データ消失 → リレー再接続 → 再取得

---

## 42. 追加のタイミング・競合シナリオ

- [ ] 2 人が同時に同じコメントにリアクション → 両方表示
- [ ] ユーザー A が削除中にユーザー B がリアクション → 削除優先
- [ ] ブックマーク toggle 高速連打 → 最終状態正しい
- [ ] ConfirmDialog 表示中に Escape → キャンセル → 即再ダイアログ → 安定
- [ ] コメント送信 → 即ページ遷移 → 送信は完了する
- [ ] リプライフォーム入力中にログアウト → フォーム消失 + 入力喪失
- [ ] 絵文字ピッカー操作中にページ遷移 → ピッカー閉じ + リーク無し
- [ ] WoT 構築中にログアウト → 計算キャンセル (generation)
- [ ] WoT 構築中にフォロー追加 → generation 変更 → 再計算
- [ ] relay 保存 → 即ログアウト → 保存は完了する
- [ ] 通知 "Mark all read" → 即新通知 → 新通知は未読
- [ ] フィルタ Follows → 即フォロー追加 → そのユーザーのコメント表示
- [ ] 共有 "Post to Nostr" 送信中にモーダル Escape → 送信は完了する?
- [ ] ブックマーク追加中にコンテンツページ離脱 → 追加は完了する
- [ ] 複数タブで同時ログイン → 各タブ独立状態
- [ ] 複数タブで同時ブックマーク → 両方 relay に到達
- [ ] relay 再接続中にコメント送信 → 接続完了後に送信
- [ ] IDB 書き込み中にページ遷移 → 書き込み完了
- [ ] プロフィール fetch 中にそのユーザーをミュート → fetch 完了後にコメント非表示
- [ ] リプライ先コメントが表示前に削除 → 孤児プレースホルダー即時表示
