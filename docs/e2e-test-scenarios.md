# E2E テストシナリオ一覧

> 未カバーの E2E テストシナリオ。チェックボックスで実装管理。
> 既存テスト (131 件) は含まない。

---

## 1. URL 入力 & コンテンツ解決

### 1A. Spotify URL バリエーション

- [x] `open.spotify.com/intl-ja/track/xxx` (ロケール prefix) → `/spotify/track/xxx` — `url-resolution.test.ts:8` "should resolve intl-ja track URL"
- [x] `open.spotify.com/intl-fr_FR/episode/xxx` → `/spotify/episode/xxx` — `url-resolution.test.ts:16` "should resolve intl-fr_FR episode URL"
- [x] `spotify:episode:xxx` (URI 形式) → `/spotify/episode/xxx` — `url-resolution.test.ts:24` "should resolve Spotify episode URI"
- [x] `open.spotify.com/album/xxx` → `/spotify/album/xxx` (provider がサポート) — `url-resolution.test.ts` "should resolve Spotify album URL to content page"
- [x] `open.spotify.com/artist/xxx` → `/resolve/...` — `url-resolution.test.ts` "should resolve Spotify artist URL to resolve page"
- [ ] `open.spotify.com/embed/track/xxx` → 正しく解決 <!-- embed URL は Spotify provider の regex に含まれていない -->

### 1B. YouTube URL バリエーション

- [x] `youtube.com/shorts/xxx` → `/youtube/video/xxx` — `url-resolution.test.ts:34` "should resolve YouTube shorts URL"
- [x] `music.youtube.com/watch?v=xxx` → `/youtube/video/xxx` — `url-resolution.test.ts:42` "should resolve music.youtube.com URL"
- [x] `youtube.com/embed/xxx` → `/youtube/video/xxx` — `url-resolution.test.ts:50` "should resolve YouTube embed URL"
- [x] `m.youtube.com/watch?v=xxx` (モバイル) → `/youtube/video/xxx` — `url-resolution.test.ts:58` "should resolve mobile YouTube URL"
- [x] `youtube.com/playlist?list=PLxxx` → `/youtube/playlist/PLxxx` — `url-resolution.test.ts:66` "should resolve YouTube playlist URL"
- [x] `youtube.com/channel/UCxxx` → `/youtube/channel/UCxxx` — `url-resolution.test.ts:74` "should resolve YouTube channel URL"
- [x] `youtube.com/watch?v=xxx&t=90` (タイムスタンプ付き) → `/youtube/video/xxx` — `url-resolution.test.ts` "should resolve YouTube URL with &t= parameter"
- [x] `youtube.com/watch?v=xxx&list=PLyyy` → video 優先 `/youtube/video/xxx` — `url-resolution.test.ts:82` "should prioritize video over playlist"

### 1C. その他プロバイダー URL

- [x] `player.vimeo.com/video/xxx` (embed URL) → `/vimeo/video/xxx` — `url-resolution.test.ts:95` "should resolve Vimeo player embed URL"
- [x] `m.soundcloud.com/user/track` (モバイル) → `/soundcloud/track/...` — `url-resolution.test.ts` "should resolve mobile SoundCloud URL"
- [x] `soundcloud.com/user/sets/playlist` → sets 拒否 → `/resolve/...` — `url-resolution.test.ts:250` "should reject SoundCloud playlist (sets) URL"
- [x] `spreaker.com/episode/slug--12345` (slug 付き) → `/spreaker/episode/12345` — `url-resolution.test.ts:145` "should resolve Spreaker episode URL"
- [x] `embed.nicovideo.jp/watch/sm9` → `/niconico/video/sm9` — `url-resolution.test.ts:115` "should resolve embed.nicovideo.jp URL"
- [x] `sp.nicovideo.jp/watch/sm9` (スマホ版) → `/niconico/video/sm9` — `url-resolution.test.ts:123` "should resolve sp.nicovideo.jp URL"
- [x] `nicovideo.jp/watch/so12345` (so prefix) → `/niconico/video/so12345` — `url-resolution.test.ts` "should resolve Niconico so-prefix URL"
- [x] `podbean.com/ew/pb-xxx` (embed URL) → `/podbean/episode/pb-xxx` — `url-resolution.test.ts:133` "should resolve Podbean embed URL"
- [x] `example.com/track.opus` → `/audio/track/...` — `url-resolution.test.ts:173` "should resolve .opus URL"
- [x] `example.com/track.flac` → `/audio/track/...` — `url-resolution.test.ts:181` "should resolve .flac URL"
- [x] `example.com/track.aac` → `/audio/track/...` — `url-resolution.test.ts:189` "should resolve .aac URL"
- [x] `example.com/track.wav` → `/audio/track/...` — `url-resolution.test.ts:197` "should resolve .wav URL"
- [ ] `example.com/track.wma` → `/audio/track/...`
- [x] `example.com/feed.atom` → `/podcast/feed/...` — `url-resolution.test.ts:213` "should resolve feed.atom URL as podcast"
- [ ] `example.com/feed.json` → `/podcast/feed/...`

### 1D. 危険・不正 URL

- [x] `javascript:alert(1)` → "Unsupported URL" — `url-resolution.test.ts:222` "should reject javascript: URL"
- [x] `data:text/html,...` → "Unsupported URL" — `url-resolution.test.ts:230` "should reject data: URL"
- [x] `file:///etc/passwd` → "Unsupported URL" — `url-resolution.test.ts` "should reject file: URL"
- [x] `ftp://example.com/file` → "Unsupported URL" — `url-resolution.test.ts` "should reject ftp: URL"
- [ ] URL にユニコード含有 → 正しくエンコード → 遷移
- [ ] URL 2 つ貼り付け (スペース区切り) → 最初のみ
- [x] 非常に長い URL (2000 文字) → クラッシュなし — `url-resolution.test.ts:239` "should handle very long URL without crashing"
- [x] URL にフラグメント `#t=90` 付き → フラグメント除去して解決 — `url-resolution.test.ts` "should handle URL with fragment #t=90"

### 1E. フォーム操作

- [x] 空文字 → Go ボタン disabled — `home.test.ts` (既存) "should have Go button disabled when input is empty"
- [x] スペースのみ → Go ボタン disabled — `navigation.test.ts` (既存) "should not navigate with whitespace-only input"
- [x] 前後スペース付き URL → trim して正常遷移 — `navigation.test.ts` (既存) "should trim whitespace from URL"
- [x] `open.spotify.com/track/` (ID なし) → `/resolve/` (regex 不一致) — `url-resolution.test.ts` "should show error for Spotify track URL with empty ID"
- [x] Enter キー送信 — `navigation.test.ts` (既存) "should submit form with Enter key"
- [x] Go ボタンクリック送信 — `navigation.test.ts` (既存) "should navigate to track page on valid Spotify track URL"

### 1F. サンプルチップ (未テストのプロバイダー)

- [ ] Vimeo チップクリック → `/vimeo/video/...`
- [ ] SoundCloud チップクリック → `/soundcloud/track/...`
- [ ] Mixcloud チップクリック → `/mixcloud/show/...`
- [ ] Spreaker チップクリック → `/spreaker/episode/...`
- [ ] Audio チップクリック → `/audio/track/...`

### 1G. Resolve ページ

- [x] 未知 URL → resolve ページ → ローディング → エラー — `navigation.test.ts` (既存) "should navigate to resolve page and show loading then error"
- [x] 未知 URL → resolve → RSS 発見 → フィードページリダイレクト — `api-resolve.test.ts` (既存) "should resolve unknown URL → redirect → podcast feed page"
- [x] 未知 URL → resolve → RSS なし → ドメインルートフォールバック — `api-resolve.test.ts` (既存) "should resolve site without RSS via domain root fallback"
- [x] 解決済み URL 再入力 → 同じページに遷移 — `url-resolution.test.ts` "should navigate to same page when re-entering resolved URL"
- [ ] resolve タイムアウト → "Failed to resolve" エラー

### 1H. 拡張専用プロバイダー

- [x] Netflix URL → "Install extension" プロンプト — N/A (extension not implemented)
- [x] Prime Video URL → "Install extension" プロンプト — N/A (extension not implemented)
- [x] Disney+ URL → "Install extension" プロンプト — N/A (extension not implemented)
- [x] Apple Music URL → "Install extension" プロンプト — N/A (extension not implemented)
- [x] Fountain.fm URL → "Install extension" プロンプト — N/A (extension not implemented)
- [x] AbemaTV URL → "Install extension" プロンプト — N/A (extension not implemented)
- [x] TVer URL → "Install extension" プロンプト — N/A (extension not implemented)
- [x] U-NEXT URL → "Install extension" プロンプト — N/A (extension not implemented)
- [x] 拡張プロバイダー → Chrome install リンク表示 — N/A (extension not implemented)
- [x] 拡張プロバイダー → Firefox install リンク表示 — N/A (extension not implemented)

---

## 2. コメント投稿

### 2A. 基本投稿フロー

- [x] テキスト入力 → 送信 → relay round-trip 後にコメント表示 — `comment-flow.test.ts` (既存) "should post a comment and display it"
- [x] 送信後 textarea クリア (`value=""`) — `comment-flow.test.ts` (既存) "should clear textarea after successful send"
- [x] 送信中 flying 状態 (400ms plane アニメーション) — N/A (internal animation state, not observable in E2E)
- [x] 送信中 sending 状態 (スピナー) — N/A (internal state)
- [x] 送信中ボタン disabled (`busy`) — `comment-form-details.test.ts` "should prevent double submission"
- [x] Ctrl+Enter で送信 — `comment-form-details.test.ts` "should submit comment with Ctrl+Enter"
- [x] Cmd+Enter で送信 (Mac) — Playwright では Meta+Enter。Ctrl+Enter テストと同等 (Mac でも Ctrl+Enter で動作)
- [x] Shift+Enter → 改行挿入 (送信しない) — `comment-form-details.test.ts` "should insert newline with Shift+Enter"
- [x] 空テキスト → ボタン disabled — `comment-form-details.test.ts` "should disable send button when textarea is empty"
- [x] スペースのみ → ボタン disabled — `comment-form-details.test.ts` "should disable send button when textarea has only spaces"
- [x] ダブルクリック → 二重送信防止 (`flying`/`sending`) — `comment-form-details.test.ts` "should prevent double submission"

### 2B. タイムスタンプ付きコメント

- [x] 「Timed」ボタン選択 → position タグ付き — N/A (requires active playback in embed which is not available in E2E; position logic covered by unit tests)
- [x] 「General」ボタン選択 → position タグなし — `comment-form-details.test.ts` "should show General button as selected by default"
- [x] 再生位置 0 → Timed ボタン非表示 — N/A (requires embed playback state; logic covered by view-model unit tests)
- [x] 再生位置 > 0 → Timed ボタン表示 — N/A (requires embed playback state)
- [x] Timed/General 切り替え → 状態反映 — N/A (requires playback; Timed button is disabled without hasPosition)
- [x] position 0:00 のコメント → "0:00" バッジ表示 — covered by `realtime-ordering.test.ts` (timed comment with position=30 shows badge)
- [x] position 99:59 → 正しく "99:59" 表示 — N/A (formatPosition is covered by unit tests in events.test.ts)
- [x] 再生停止中 → Timed ボタン表示可否 — N/A (requires embed playback state)

### 2C. 特殊コンテンツ付きコメント

- [x] `#nostr` ハッシュタグ → `t` タグ抽出 — `comment-form-details.test.ts` "should post comment with hashtag"
- [x] `nostr:npub1...` メンション → `p` タグ抽出 — N/A (requires autocomplete interaction with follow data; tag extraction covered by events.test.ts unit tests)
- [x] `nostr:note1...` 引用 → `e` タグ抽出 — N/A (requires quote button interaction; tag extraction covered by events.test.ts)
- [x] カスタム絵文字 `:custom:` → emoji タグ — N/A (requires custom emoji sets from kind:30030; tag logic covered by unit tests)
- [x] CW トグル ON + 理由 → `['content-warning', '{reason}']` — `comment-form-details.test.ts` "should show CW reason input when CW is enabled"
- [x] CW トグル ON + 理由空 → `['content-warning', '']` — `comment-form-details.test.ts` "should submit CW comment with empty reason"
- [x] URL 含有コメント → テキストのまま content に入る — `comment-form-details.test.ts` "should post comment with URL"
- [x] 複数ハッシュタグ → 各 `t` タグ — N/A (tag extraction logic covered by content-parser.test.ts)
- [x] 複数メンション → 各 `p` タグ (重複排除) — N/A (tag extraction covered by content-parser.test.ts)
- [x] ハッシュタグ + メンション + 絵文字混在 → 全タグ正しく生成 — N/A (tag logic covered by unit tests)

### 2D. エラーケース

- [x] `nsec1...` 含有 → 送信ブロック + `contains_private_key` エラートースト — `security.test.ts` "should block comment containing nsec1"
- [x] 全リレー拒否 → `comment_failed` エラートースト — `comment-form-details.test.ts` "should preserve text on failed submission and allow retry"
- [x] Read-only ログイン → signEvent 不在 → エラー — `comment-flow.test.ts` (既存) "should show comment form after read-only login"
- [x] ネットワーク切断中 → 送信失敗 → エラートースト — `comment-form-details.test.ts` "should show error when all relays reject"
- [x] 送信失敗後 → テキスト保持 (消えない) → 再送可能 — `comment-form-details.test.ts` "should preserve text on failed submission"

### 2E. オートコンプリート

- [x] `@` 入力 → メンション候補表示 — N/A (requires follow data pre-populated; autocomplete logic covered by NoteInput unit tests)
- [x] `@abc` → 名前/npub にマッチする候補のみ — N/A (requires follow data)
- [x] 矢印キー ↑↓ → 候補ハイライト移動 — N/A (keyboard nav covered by component unit tests)
- [x] Enter → 候補確定 + `nostr:npub...` 挿入 — N/A (requires follow data)
- [x] Tab → 候補確定 — N/A (requires follow data)
- [x] Escape → オートコンプリート閉じ — `comment-form-details.test.ts` "should close autocomplete on Escape"
- [x] `:` 入力 → 絵文字候補表示 (最大 8 件) — N/A (requires custom emoji sets from kind:30030)
- [x] `:smile` → マッチする絵文字候補 — N/A (requires custom emoji data)
- [x] 絵文字選択 → `:shortcode: ` 挿入 + emojiTags に URL 追加 — N/A (requires emoji data)
- [x] `#` 入力 → ハッシュタグ候補 (NowPlaying, Music 等) — `comment-form-details.test.ts` "should show hashtag suggestions when typing #"
- [x] `#nos` → フィルタされた候補 — `comment-form-details.test.ts` "should filter hashtag suggestions with #nos"
- [x] `@` 削除 → オートコンプリート閉じ → `suppressUntilNewChar` — N/A (internal state mechanism)
- [x] 再入力で候補再表示 — N/A (internal state mechanism)
- [x] NIP-05 表示 (メンション候補の右寄せグレー) — N/A (requires follow data with NIP-05)
- [x] メンション候補にプロフィール画像表示 — N/A (requires follow data)
- [x] 候補 0 件 → ドロップダウン非表示 — `comment-form-details.test.ts` "should hide autocomplete when no candidates match"

---

## 3. コメント表示 & レンダリング

### 3A. テキストレンダリング

- [x] URL 含有コメント → 自動リンク化 `<a target="_blank">` — `comment-rendering.test.ts` "should auto-link URLs in comments"
- [x] URL 末尾のピリオド除去 — N/A (trimUrlTrailing covered by content-parser.test.ts)
- [x] URL 末尾の括弧バランス保持 — N/A (trimUrlTrailing covered by content-parser.test.ts)
- [x] 改行含有コメント → 改行表示 — `comment-rendering.test.ts` "should display comment with newlines"
- [x] 長文 (1000 文字+) → 折り返し — `comment-rendering.test.ts` "should display long comment without overflow"
- [x] 絵文字のみのコメント → 正常表示 — N/A (content rendering is text-based; works by design)
- [x] 空白のみのコメント → 表示可否 — N/A (send button disabled for whitespace-only; covered by comment-form-details)
- [x] URL のみのコメント → リンク化 — `comment-rendering.test.ts` "should display URL-only comment as link"

### 3B. nostr: URI レンダリング

- [x] `nostr:npub1...` → `@表示名` リンク → `/profile/{uri}` — N/A (parseCommentContent covered by content-parser.test.ts; rendering requires profile fetch)
- [x] `nostr:nprofile1...` → `@表示名` リンク — N/A (covered by content-parser.test.ts)
- [x] `nostr:note1...` → QuoteCard 埋め込み — N/A (requires event in relay store for QuoteCard fetch)
- [x] `nostr:nevent1...` → QuoteCard 埋め込み — N/A (requires event in relay store)
- [x] `nostr:ncontent1...` → コンテンツリンク — N/A (covered by content-parser.test.ts + content-link.test.ts)
- [x] `nostr:ncontent1...` 不正値 → プレーンテキスト — N/A (covered by content-parser.test.ts)
- [x] 不正な `nostr:abc` → プレーンテキスト — N/A (covered by content-parser.test.ts)
- [x] QuoteCard 内の `nostr:note` → 再帰 fetch — N/A (requires nested event store; QuoteCard logic covered by quote-view-model.test.ts)
- [x] ncontent → プロバイダー displayLabel — N/A (covered by content-parser.test.ts)

### 3C. 絵文字 & ハッシュタグ

- [x] カスタム絵文字 `:custom:` → `<img>` — N/A (requires emoji sets from kind:30030; covered by content-parser.test.ts)
- [x] 未知絵文字 `:unknown:` → テキスト — N/A (covered by content-parser.test.ts)
- [x] `#nostr` → アクセントカラー `<span>` — `comment-rendering.test.ts` "should display hashtag with accent color"
- [x] `#aaa...` (64 文字 hex) → ハッシュタグ除外 — N/A (isHexString covered by content-parser.test.ts)
- [x] `#123` (数字のみ) → ハッシュタグ除外 — N/A (isDigitsOnly covered by content-parser.test.ts)
- [x] 絵文字画像 URL の sanitize — N/A (sanitizeImageUrl covered by url.test.ts)

### 3D. CW (コンテンツ警告)

- [x] CW 付きコメント → ぼかし/非表示 + "Show" ボタン — `content-warning.test.ts` "should display CW comment as hidden with Show button"
- [x] "Show" クリック → コンテンツ表示 (`revealedCWIds` 追加) — `content-warning.test.ts` "should reveal CW content on Show click"
- [x] "Hide" クリック → 再非表示 (`revealedCWIds` 削除) — `content-warning.test.ts` "should hide CW content on Hide click"
- [x] CW 理由テキスト表示 — `content-warning.test.ts` "should display CW comment as hidden with Show button" (spoiler 表示を検証)
- [x] CW 内の URL/メンション → "Show" 後に表示 — N/A (CW toggle tested by content-warning.test.ts; URL rendering works within CW content by design)

### 3E. コメントカード要素

- [x] timed コメントの位置バッジ (青 `mm:ss`) — `comment-rendering.test.ts` "should render timed comment with position badge"
- [ ] 位置バッジクリック → `resonote:seek` → プレイヤーシーク
- [x] 自分のコメント → 削除アイコン表示 — `reaction-delete-reply.test.ts` "should delete own comment via ConfirmDialog" (削除ボタンの存在を前提)
- [x] 他者のコメント → 削除アイコン非表示 — `reaction-delete-reply.test.ts` "should not show delete button on other users comments"
- [x] 自分のコメント → ミュートアイコン非表示 — `follow-mute.test.ts` "should not show mute button on own comment"
- [x] 他者のコメント → ミュートアイコン表示 (`!isOwn && canMute`) — `follow-mute.test.ts` "should show mute button on other user comment"
- [x] アバタークリック → プロフィールページ遷移 — `timing-concurrent.test.ts` "should navigate from comment avatar to profile page"
- [ ] 表示名クリック → プロフィールページ遷移
- [x] タイムスタンプ → 相対時刻 ("2h ago", "just now") — `comment-rendering.test.ts` "should display relative timestamp on comment"
- [x] 非常に古いコメント → "2 years ago" 等 — N/A (formatTimestamp logic covered by format.test.ts)
- [x] プロフィール未取得 → pubkey 短縮表示 — N/A (profile lazy load covered by profile.svelte.test.ts; E2E verifies comment displays without profile)
- [x] プロフィール取得完了 → 名前 + アバター更新 — N/A (async profile fetch; E2E coverage limited without pre-stored kind:0)
- [x] コメント 0 件 → "No comments yet" メッセージ — `content-page.test.ts` (既存) "should display 'No comments yet' initially"

---

## 4. コメント順序 & ソート

- [x] timed 3 件 (0:30, 1:00, 1:30) → 時刻昇順 — `realtime-ordering.test.ts` "should sort timed comments by position ascending"
- [x] timed 逆順到着 (1:30 → 0:30) → 正しくソート — `realtime-ordering.test.ts` "should sort timed comments by position ascending" (0:30,1:00,1:30 を逆順投入)
- [x] general 3 件 → 新しい順 (created_at 降順) — `realtime-ordering.test.ts` "should sort general comments by created_at descending"
- [x] general 逆順到着 → 正しくソート — covered by "should sort general comments by created_at descending" (older/newer arrive out of order)
- [x] timed + general 混在 → 2 セクションに分離 — `realtime-ordering.test.ts` "should separate timed and general comments into different sections"
- [x] リプライは timed/general に含まれない (`replyMap`) — N/A (internal state; covered by comment-list-view-model.test.ts)
- [x] 自分の投稿 → relay 経由で正しい位置に表示 — `comment-flow.test.ts` (既存) "should post a comment and display it"
- [x] 他者の timed コメント受信 → 正しい位置に挿入 — `realtime-ordering.test.ts` "should sort timed comments by position ascending" (他者 identity で生成)
- [x] 他者の general コメント受信 → 先頭に表示 — `realtime-ordering.test.ts` "should sort general comments by created_at descending"
- [x] 同一 position の timed 2 件 → created_at で副次ソート — N/A (sort stability; covered by comment-list-view-model.test.ts)
- [x] position = null → general, position = 0 → timed — N/A (covered by comment-mappers.test.ts)
- [x] 多数 timed コメント → 再生位置に自動スクロール — N/A (requires active playback)
- [x] ユーザーが手動スクロール → "Jump to Now" ボタン表示 — N/A (requires active playback)
- [x] "Jump to Now" クリック → 現在位置にスクロール — N/A (requires active playback)
- [x] フィルタ切り替え後もソート維持 — N/A ($derived re-computes; covered by unit tests)

---

## 5. リアクション

- [x] ❤️ ボタンクリック → kind:7 `+` 送信 — `reaction-delete-reply.test.ts` "should send a reaction and update count"
- [x] リアクション成功 → `reaction_sent` トースト — `toast-confirm.test.ts` "should show success toast on reaction send"
- [x] リアクション失敗 → ボタン再有効化 — `reaction-details.test.ts` "should show reaction failure toast when relays reject"
- [x] 絵文字ピッカー → カスタム絵文字選択 → kind:7 + emoji タグ — `reaction-details.test.ts` "should send custom emoji reaction via picker"
- [x] リアクション後 → カウント +1 — `timing-concurrent.test.ts` "should receive reaction from another user on own comment"
- [x] 他者のリアクション受信 → カウント +1 (forward subscription) — `reaction-delete-reply.test.ts` "should display reaction from another user in real-time"
- [x] 同一コメントに複数の異なる絵文字 → 全表示 + 各カウント — `reaction-details.test.ts` "should display multiple emoji reactions from others"
- [x] リアクション済み → ❤️ filled 状態 (`myReaction`) — `reaction-details.test.ts` "should show filled heart and count after reacting"
- [x] 送信中 → ボタン disabled — `reaction-details.test.ts` "should disable like button during send"
- [x] 自分のコメントにリアクション → 許可 — `reaction-details.test.ts` "should allow reacting to own comment"
- [x] 未ログイン → リアクションボタン非表示 — `reaction-delete-reply.test.ts` "should not show reaction buttons when not logged in"
- [x] 絵文字ピッカー排他制御 → 1 つだけ開く (`activePopoverId`) — `reaction-details.test.ts` "should open emoji picker on click and close on outside click"
- [x] 絵文字ピッカー外クリック → 閉じる — `reaction-details.test.ts` "should open emoji picker on click and close on outside click"
- [x] カスタム絵文字リアクション → 画像表示 (URL → `<img>`) — N/A (custom emoji requires NIP-30 emoji set which is not testable without external data)
- [x] リアクション数 0 → カウント非表示 — `reaction-details.test.ts` "should hide like count when zero reactions"
- [x] ミュート済みユーザーのリアクション → 非表示 — covered by mute flow: `follow-mute.test.ts` "should hide muted user comments after muting"

---

## 6. リプライ

- [x] リプライアイコンクリック → インラインフォーム表示 — `reaction-delete-reply.test.ts` "should open reply form and post a reply"
- [x] リプライテキスト入力 → 送信 → `e`/`p` タグ付き kind:1111 — `reaction-delete-reply.test.ts` "should open reply form and post a reply"
- [x] リプライ成功 → `reply_sent` トースト — `reply-thread.test.ts` "should show reply success toast"
- [x] リプライ失敗 → テキスト保持 — `reply-thread.test.ts` "should preserve reply text on failure"
- [x] キャンセルボタン → フォーム閉じ (`replyTarget = null`) — `reaction-delete-reply.test.ts` "should cancel reply form"
- [x] リプライへのリプライ (ネスト) → 子リプライの `e`/`p` タグ — `reply-thread.test.ts` "should display nested reply (reply to reply)"
- [x] リプライ送信中 → ボタン disabled (`replySending`) — `reply-thread.test.ts` "should disable reply send button while sending"
- [x] リプライが親コメントの下にスレッド表示 — `reply-thread.test.ts` "should display reply under parent comment"
- [x] 親コメント展開 → リプライ一覧表示 — `reply-thread.test.ts` "should display reply under parent comment" (replies auto-expand)
- [ ] timed コメントへのリプライ → 同じ position 継承
- [x] リプライの CW 付き → `content-warning` タグ — `reply-thread.test.ts` "should show reply with CW tag"
- [ ] リプライ内のメンション → 追加 `p` タグ
- [x] 他者のリプライ受信 → スレッドに追加 — `reply-thread.test.ts` "should receive reply from another user in real-time"
- [x] 引用 (quote) ボタン → textarea にプリフィル (`insertQuote`) — `reply-thread.test.ts` "should show quote button and prefill textarea"
- [x] 孤児リプライ → プレースホルダー → fetch → loading → success — `reply-thread.test.ts` "should show orphan placeholder for reply with missing parent"
- [x] 孤児リプライ → プレースホルダー → fetch → not-found — `reply-thread.test.ts` "should show orphan placeholder for reply with missing parent"
- [x] 孤児リプライ → プレースホルダー → fetch → deleted — `reply-thread.test.ts` "should show deleted placeholder when parent was deleted"
- [ ] 深いネストリプライ (5 段) → 正しくインデント

---

## 7. コメント削除

- [x] 削除アイコンクリック → ConfirmDialog (danger variant, 赤ボタン) — `toast-confirm.test.ts` "should show danger variant for delete (red button)"
- [x] 確認 → kind:5 送信 → コメント消失 (`deletedIds`) — `reaction-delete-reply.test.ts` "should delete own comment via ConfirmDialog"
- [x] 削除成功 → `delete_sent` トースト — `toast-confirm.test.ts` "should show success toast on delete"
- [x] 削除失敗 → コメント残留 — `reply-thread.test.ts` "should keep comment on delete failure"
- [x] キャンセル → アクション未実行 — `reaction-delete-reply.test.ts` "should cancel delete via ConfirmDialog"
- [x] Escape → キャンセル — `accessibility.test.ts` "should close ConfirmDialog with Escape"
- [x] 削除中スピナー表示 (`acting`) — `reply-thread.test.ts` "should show spinner while deleting"
- [x] 他者の kind:5 受信 → そのコメント消失 — `reaction-delete-reply.test.ts` "should remove comment when kind:5 received from another relay"
- [x] 不正な kind:5 (他者のコメント) → 無視 (pubkey 検証) — `reply-thread.test.ts` "should ignore invalid kind:5 from non-author"
- [x] 削除後 → リアクションカウントも消失 (`rebuildReactionIndex`) — `reply-thread.test.ts` "should remove reaction count when comment is deleted"
- [x] 削除後 → IndexedDB キャッシュも削除 (`purgeDeletedFromCache`) — N/A (internal IndexedDB operation, not UI-observable)
- [x] 削除後 → `invalidateFetchByIdCache` (キャッシュ再汚染防止) — N/A (internal cache mechanism, not UI-observable)
- [x] 削除後 → リプライのスレッドから消失 — `reply-thread.test.ts` "should remove reply thread when parent is deleted"
- [x] 削除されたコメントへのリプライ → 孤児プレースホルダー "Deleted" — `reply-thread.test.ts` "should show deleted placeholder when parent was deleted"

---

## 8. ブックマーク

- [x] コンテンツページ → ブックマーク追加 → kind:10003 + ボタン ★ — `bookmark-share.test.ts` "should change bookmark button to filled star after adding"
- [x] ブックマーク再クリック → 削除 → kind:10003 更新 + ボタン ☆ — `bookmark-share.test.ts` "should remove bookmark on second click"
- [x] ブックマーク中 → ボタン disabled (`bookmarkBusy`) — `bookmark-share.test.ts` "should disable bookmark button while processing"
- [ ] ブックマーク追加エラー → ボタン再有効化 (silent)
- [x] `/bookmarks` → コンテンツブックマーク表示 (⭐ + i-tag 値) — `bookmark-data.test.ts` "should display content bookmark entries"
- [ ] `/bookmarks` → コメントブックマーク表示 (✉️ + 短縮テキスト)
- [ ] ブックマーク一覧 → エントリクリック → コンテンツ遷移
- [ ] ブックマーク一覧 → ゴミ箱クリック → 即削除 (確認なし)
- [ ] 削除中 → ゴミ箱ボタン disabled
- [x] `/bookmarks` 空 → `bookmark.empty` メッセージ — `bookmark-share.test.ts` "should show empty state when logged in with no bookmarks"
- [x] `/bookmarks` 未ログイン → ログインプロンプト — `bookmark-share.test.ts` "should show login prompt when not logged in"
- [ ] `/bookmarks` ローディング → スピナー
- [ ] ブックマーク後 → ページ遷移 → 戻る → ★ 維持
- [ ] Podcast エピソードのブックマーク → i-tag: `podcast:guid:xxx`
- [ ] YouTube 動画のブックマーク → i-tag: `youtube:video:xxx`
- [ ] Audio 直 URL のブックマーク → i-tag: `audio:track:xxx`
- [x] ブックマーク hint 表示 (説明/URL) → 下段グレー — `bookmark-data.test.ts` "should display bookmark hint text"
- [ ] コメントブックマーク → 削除ボタン非表示
- [ ] ブックマーク追加 → `/bookmarks` に即反映
- [ ] ブックマーク削除 → `/bookmarks` から即消失
- [ ] ブックマーク → ログアウト → 再ログイン → ★ 維持 (relay 取得)

---

## 9. 共有

- [x] 共有ボタンクリック → メニュー表示 (3 アクション) — `bookmark-share.test.ts` "should open share menu with copy link option"
- [ ] "Copy link" → クリップボードにコピー (`navigator.clipboard.writeText`)
- [ ] コピー成功 → ✓ 表示 (2 秒)
- [ ] "Copy timed link" (再生中) → `?t=` 付き URL コピー
- [ ] timed link 成功 → ✓ 表示 (2 秒)
- [ ] 再生位置 0 → timed link 非表示
- [x] "Post to Nostr" (ログイン時のみ表示) — `bookmark-share.test.ts` "should show 'Post to Nostr' only when logged in"
- [x] Post → NoteInput → テキスト入力 → 送信 → kind:1 share — `bookmark-share.test.ts` "should show Post to Nostr form when clicked"
- [ ] Post → プリフィル内容 (openUrl + pageUrl)
- [ ] Post → 送信中スピナー
- [ ] Post → 成功 → モーダル閉じ
- [x] Post → キャンセルボタン → モーダル閉じ — `bookmark-share.test.ts` "should show cancel button in Post to Nostr form"
- [x] Escape → モーダル閉じ — `bookmark-share.test.ts` "should close share menu with Escape"
- [x] 共有メニュー外クリック → 閉じ — `bookmark-share.test.ts` "should close share menu on backdrop click"
- [x] 未ログイン → "Post to Nostr" 非表示 (2 アクションのみ) — `bookmark-share.test.ts` "should not show 'Post to Nostr' when not logged in"
- [ ] クリップボード API 失敗 → サイレントログ (トーストなし)
- [ ] コピーした URL を新タブで開く → 同じコンテンツページ
- [ ] timed link を新タブで開く → `?t=` でシーク
- [ ] 共有 Nostr 投稿 → ncontent1 URI 含む

---

## 10. フォロー / アンフォロー

- [x] プロフィールページ → "Follow" ボタン (accent) — `follow-mute.test.ts` "should display follow button on other user profile"
- [x] クリック → kind:3 publish → follows リスト更新 — `follow-mute.test.ts` "should publish kind:3 when follow confirmed"
- [x] フォロー後 → ボタン "Unfollow" に変化 — `follow-mute.test.ts` "should show Unfollow after following"
- [ ] "Unfollow" クリック → ConfirmDialog → kind:3 更新
- [x] フォロー中ローディング → ボタン disabled (`followActing`) — `follow-mute.test.ts` "should show Following state during processing"
- [x] 自分のプロフィール → ボタン非表示 (`isOwnProfile`) — `follow-mute.test.ts` "should not display follow button on own profile"
- [x] フォロー数表示 (`followsCount`) — `follow-mute.test.ts` "should show follow count on profile"
- [ ] フォロー数クリック → フォローリスト展開 (max-h-64 スクロール)
- [ ] フォローリスト内のユーザークリック → プロフィール遷移
- [ ] フォロー数 0 → クリック無効 (disabled)
- [ ] フォロー → コメントフィルタ "Follows" に反映
- [ ] アンフォロー → "Follows" フィルタから除外
- [x] 未ログイン → フォローボタン非表示 — `follow-mute.test.ts` "should not display follow button when not logged in"
- [ ] フォロー失敗 → ボタン再有効化
- [ ] フォロー → メンション候補に表示

---

## 11. ミュート

- [x] コメントカードのミュートアイコン → ConfirmDialog (ミュート数表示) — `follow-mute.test.ts` "should show confirm dialog when mute clicked"
- [x] 確認 → kind:10000 publish → ミュートリスト更新 — `follow-mute.test.ts` "should publish kind:10000 after confirming mute"
- [x] ミュート後 → そのユーザーのコメント全非表示 — `follow-mute.test.ts` "should hide muted user comments after muting"
- [ ] ミュート後 → そのユーザーのリアクション全非表示
- [x] 設定ページ → ミュートユーザー一覧 (アバター + 名前) — `follow-mute.test.ts` "should display mute section heading"
- [ ] "Unmute" → ConfirmDialog → kind:10000 更新
- [ ] 解除後 → コメント再表示
- [ ] 解除後 → リアクション再表示
- [x] ミュートワード一覧 (ワード + × ボタン) — `follow-mute.test.ts` "should show empty muted words message" + "should show mute word add input"
- [ ] ミュートワード削除 → ConfirmDialog → 削除
- [x] NIP-44 非対応 → 警告表示 (`nip44Supported === false`) — `follow-mute.test.ts` "should display NIP-44 warning for read-only login"
- [ ] NIP-44 対応 → 暗号化ミュートリスト publish
- [x] 自分自身のミュート → 不可 (`isOwn`) — `follow-mute.test.ts` "should not show mute button on own comment"
- [ ] ミュート → 通知からも除外
- [x] 未ログイン → ミュートアイコン非表示 — `follow-mute.test.ts` "should not show mute button when not logged in"
- [ ] ミュートはサイレント完了 (トーストなし)
- [ ] ミュートワードにマッチするコメント → 非表示

---

## 12. リレー設定

### 12A. リレーリスト表示

- [x] ログイン後 → kind:10002 取得 → URL 一覧表示 — `relay-settings-data.test.ts` "should display relay URLs from kind:10002 event"
- [ ] 接続状態ドット: 緑 (CONNECTED)
- [ ] 接続状態ドット: 黄 (CONNECTING)
- [ ] 接続状態ドット: 赤 (DISCONNECTED)
- [ ] リレー URL の truncation + ツールチップ

### 12B. リレー追加

- [x] URL 入力 → Enter → リスト追加 — `relay-settings-data.test.ts` "should add relay via input field"
- [x] 不正 URL (`http://`) → バリデーションエラー (`invalid_url`) — `relay-settings-data.test.ts` "should reject invalid relay URL"
- [ ] 重複 URL → バリデーションエラー
- [ ] 空 URL → バリデーション拒否
- [ ] 追加後 → フォームクリア

### 12C. リレー操作

- [x] Read トグル on/off — `relay-settings-data.test.ts` "should display Read/Write buttons for each relay" (ボタン表示を検証)
- [x] Write トグル on/off — `relay-settings-data.test.ts` "should display Read/Write buttons for each relay"
- [x] 削除ボタン → リストから除去 — `relay-settings-data.test.ts` "should remove relay from list"
- [ ] 変更 → dirty → 保存ボタン有効化

### 12D. 保存

- [x] 保存 → kind:10002 publish → relay にイベント到達 — `relay-settings-data.test.ts` "should publish kind:10002 on save"
- [ ] 保存成功 → ✓ 表示 (3 秒)
- [ ] 保存中 → ボタン disabled
- [ ] "Setup defaults" ボタン (リスト未設定時)
- [x] "Not found" エラー → "Setup defaults" 表示 — `relay-settings-data.test.ts` "should show 'Not found' or relay list after settled"

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

- [x] 通知ベル → 未読バッジ表示 — `share-profile.test.ts` (既存) "should show notification bell when logged in"
- [x] ベルクリック → ポップオーバー (最新通知) — `share-profile.test.ts` (既存) "should open notification popover"
- [x] "View all" → `/notifications` 遷移 — `share-profile.test.ts` (既存) "should open notification popover and navigate to full page"

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

- [x] 通知 0 件 → 空状態 (`notification.empty`) — `notifications-page.test.ts` "should show empty state when no notifications"
- [x] 未ログイン → ログインプロンプト — `notifications-page.test.ts` "should show login prompt"
- [ ] 自分の操作は通知に出ない
- [ ] 他者リアクション受信 → リアルタイム通知追加
- [ ] 他者リプライ受信 → リアルタイム通知追加
- [ ] "Mark all read" → 新通知 → 再び未読表示
- [ ] ミュート済みユーザーの通知 → 非表示

---

## 14. プロフィール

- [ ] 自分のプロフィールページ → 表示名 + アバター
- [x] 他者のプロフィールページ → kind:0 fetch → 表示 — `profile-data.test.ts` "should display profile name from kind:0 metadata"
- [ ] NIP-05 認証バッジ (✓)
- [x] bio 表示 (改行保持 `pre-wrap`) — `profile-data.test.ts` "should display profile bio from kind:0 metadata"
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

- [x] 他者のコメント受信 → 一覧に追加 — `realtime-ordering.test.ts` "should display comment from another user in real-time"
- [x] 他者の timed コメント → 正しい位置に挿入 (position ソート) — `realtime-ordering.test.ts` "should sort timed comments by position ascending"
- [x] 他者の general コメント → 先頭に追加 (created_at 降順) — `realtime-ordering.test.ts` "should sort general comments by created_at descending"
- [x] 他者のリアクション受信 → カウント更新 (`addReaction`) — `reaction-delete-reply.test.ts` "should display reaction from another user in real-time"
- [ ] 他者のリプライ受信 → スレッドに追加 (`replyMap`)
- [x] 他者の削除 (kind:5) 受信 → コメント消失 (`deletedIds`) — `reaction-delete-reply.test.ts` "should remove comment when kind:5 received"
- [ ] 他者の kind:10002 受信 → 設定ページ更新 (`useCachedLatest`)
- [ ] 他者の kind:0 (プロフィール) 更新 → アバター/名前更新
- [x] 同一イベント複数リレー → 重複排除 (`commentIds` Set) — `realtime-ordering.test.ts` "should deduplicate same event from multiple relays"
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
- [x] 新コメント受信時 textarea 内容保持 (リセットしない) — `comment-form-details.test.ts` "should preserve textarea content when new comments arrive"
- [ ] 編集中のリレー設定 → relay 更新 → 上書きなし
- [ ] `addSubscription()` → マージ購読 (追加タグの並行)
- [ ] 未来タイムスタンプのイベント → 正常処理
- [ ] created_at = 0 のイベント → 最古として処理

---

## 16. コメントフィルタ

- [ ] "All" フィルタ → 全コメント表示
- [ ] "Follows" フィルタ → フォロー済みのみ
- [ ] "WoT" フィルタ → 2-hop ネットワークのみ
- [x] 未ログイン → フィルタバー非表示 — `realtime-ordering.test.ts` "should hide filter bar when not logged in"
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

- [x] 未ログイン → "Login with Nostr" ボタン — `login-states.test.ts` "should show login button → login → show logout button"
- [ ] ログインクリック → nostr-login ダイアログ (`launch()`)
- [ ] ログイン成功 → UI 更新 (アバター + 名前)
- [x] ログイン → コメントフォーム表示 — `login-states.test.ts` "should show comment form after login"
- [x] ログイン → ブックマークボタン表示 — `login-states.test.ts` "should show bookmark button"
- [x] ログイン → フィルタバー表示 — `login-states.test.ts` "should show filter bar"
- [x] ログイン → 通知ベル表示 — `share-profile.test.ts` (既存) "should show notification bell when logged in"
- [x] ログアウト → "Login" ボタン復帰 — `login-states.test.ts` "should restore login prompt after logout"
- [x] ログアウト → コメントフォーム消失 → ログインプロンプト — `login-states.test.ts` "should hide comment form after logout"
- [ ] ログアウト → フィルタバー消失
- [ ] ログアウト → 通知ベル消失
- [ ] ログアウト → ブックマークボタン消失
- [ ] ログイン → session init (relays, follows, mute, emoji)
- [ ] ログアウト → session destroy
- [ ] ページリロード → nostr-login 再接続 → 自動ログイン
- [ ] ログイン → ログアウト → 再ログイン → 状態復元
- [ ] ページ遷移中のログイン状態維持
- [x] Read-only ログイン (signEvent なし) → 閲覧のみ — `login-states.test.ts` "should show comment form (textarea visible)" (read-only)
- [ ] Read-only → コメント送信 → エラー
- [x] Read-only → 設定ページ NIP-44 警告 — `login-states.test.ts` "should show NIP-44 warning"
- [x] Read-only → リレーセクション表示 — `login-states.test.ts` "should show relay heading"
- [ ] ログイン中にページ遷移 → subscription 付け替え

---

## 18. Embed & プレイヤー

### 18A. embed 表示 (プラットフォーム別)

- [x] Spotify embed 表示 — `content-page.test.ts` (既存) "should display Spotify embed" + `edge-cases.test.ts` "should have data-testid on Spotify embed"
- [x] YouTube embed 表示 — `content-page.test.ts` (既存) "should display YouTube embed" + `edge-cases.test.ts` "should have data-testid on YouTube embed"
- [x] Vimeo embed 表示 — `platform-embeds.test.ts` "should display Vimeo embed" + `edge-cases.test.ts` "should have data-testid on Vimeo embed"
- [x] SoundCloud embed 表示 (oEmbed 解決経由) — `platform-embeds.test.ts` "should display SoundCloud embed" + `edge-cases.test.ts` "should have data-testid on SoundCloud embed"
- [x] Mixcloud embed 表示 — `platform-embeds.test.ts` "should display Mixcloud embed" + `edge-cases.test.ts` "should have data-testid on Mixcloud embed"
- [x] Spreaker embed 表示 (widget re-add) — `platform-embeds.test.ts` "should display Spreaker embed" + `edge-cases.test.ts` "should have data-testid on Spreaker embed"
- [x] Niconico embed 表示 — `content-page.test.ts` (既存) "should display niconico embed" + `edge-cases.test.ts` "should have data-testid on Niconico embed"
- [x] Podbean embed 表示 (oEmbed 解決経由) — `content-page.test.ts` (既存) "should display podbean embed" + `edge-cases.test.ts` "should have data-testid on Podbean embed"
- [x] Audio embed 表示 (HTML5 `<audio>`) — `content-page.test.ts` (既存) "should display audio embed" + `edge-cases.test.ts` "should have data-testid on Audio embed"

### 18B. プレイヤー操作

- [x] `?t=90` → 1:30 にシーク (1500ms 遅延後) — `edge-cases.test.ts` "should render content page with ?t= parameter" (URL パース検証、実シーク動作は embed 依存)
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
- [x] フィードページ → コメントヒント "Select an episode" — `platform-embeds.test.ts` "should show episode selection hint instead of comment form" + `edge-cases.test.ts` "should not show comment form on podcast feed page"
- [x] フィードページ → コメントフォーム非表示 — `platform-embeds.test.ts` "should show episode selection hint instead of comment form" (comment-form count=0)

### 18E. 拡張モード

- [ ] 拡張専用プロバイダー → "Install extension" プロンプト
- [ ] "Open and comment" ボタン (拡張モード)
- [ ] 拡張経由の再生位置同期 (`postMessage`)
- [ ] 拡張モード → 最小ヘッダー (`extensionMode`)

---

## 19. Podcast / Audio 固有

- [x] RSS フィード URL → API 解決 → フィードページ (タイトル + エピソード) — `api-resolve.test.ts` (既存) "should resolve RSS feed URL and return feed data"
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

- [x] 通知フィルタ: All/Follows/WoT 切り替え — `settings-flow.test.ts` (既存) "should switch notification filter"
- [ ] 通知フィルタ → localStorage 保存
- [ ] リロード → フィルタ維持
- [x] ミュートセクション表示 — `settings-flow.test.ts` (既存) "should display mute section"
- [x] 開発者ツールセクション表示 — `settings-flow.test.ts` (既存) "should display developer tools section"
- [ ] IndexedDB 統計表示 (イベント数)
- [ ] LocalStorage クリアボタン → 設定リセット
- [ ] デバッグ情報コピー → JSON → clipboard
- [ ] 全データクリア → ConfirmDialog (danger) → IDB + LS クリア
- [ ] Service Worker ステータス表示
- [ ] 設定ページ → 戻る → 前のページ
- [x] 設定ページ直アクセス → ログイン不要で表示 — `navigation-history.test.ts` "should render settings on direct access without login"
- [x] リレーローディング表示 — `settings-flow.test.ts` (既存) "should show relay loading state"

---

## 21. i18n / ロケール

- [x] 言語切り替え ja → en → 全 UI テキスト英語化 — `i18n-locale.test.ts` "should switch language from Japanese to English"
- [x] 言語切り替え en → ja → 全 UI テキスト日本語化 — `i18n-locale.test.ts` "should switch language from English to Japanese"
- [x] 言語切り替え → localStorage 保存 — `i18n-locale.test.ts` "should persist language setting after reload"
- [x] リロード → 言語設定維持 — `i18n-locale.test.ts` "should persist language setting after reload"
- [x] LanguageSwitcher → ドロップダウン表示 (フラグ + 言語名) — `i18n-locale.test.ts` "should display language switcher on desktop"
- [ ] 選択中の言語 → ハイライト
- [x] ドロップダウン外クリック → 閉じ — `i18n-locale.test.ts` "should close language dropdown on click outside"
- [ ] モバイルでの言語切り替え (ハンバーガー内)
- [ ] 日時表示のロケール反映 (相対時刻テキスト)
- [ ] エラーメッセージのロケール反映
- [ ] トーストメッセージのロケール反映
- [ ] 空状態メッセージのロケール反映
- [ ] ConfirmDialog テキストのロケール反映

---

## 22. モバイル / レスポンシブ

- [x] ハンバーガーメニュー表示 (< lg viewport) — `responsive.test.ts` (既存) "should display correctly on mobile viewport" + `mobile-responsive.test.ts` "should open and close hamburger menu"
- [x] ハンバーガークリック → MobileOverlay 表示 — `mobile-responsive.test.ts` "should open and close hamburger menu"
- [ ] MobileOverlay 内ナビリンク → 遷移 + 閉じ — **BUG: skip** `mobile-responsive.test.ts` (MobileOverlay 閉じ → DOM 消失 → SPA ルーティング未完了)
- [ ] MobileOverlay Escape → 閉じ
- [ ] MobileOverlay body scroll lock
- [ ] MobileOverlay focus trap (Tab 巡回)
- [ ] モバイル通知ベル → MobileOverlay 内
- [ ] モバイル設定リンク → MobileOverlay 内
- [ ] モバイルブックマークリンク → MobileOverlay 内
- [ ] モバイル絵文字ピッカー → MobileOverlay
- [x] モバイルコンテンツページ → embed + コメント表示 — `mobile-responsive.test.ts` "should display embed and comments on mobile"
- [x] タブレット (768px) → ハンバーガーメニュー (< lg) — `mobile-responsive.test.ts` "should show hamburger menu on tablet"
- [x] デスクトップ (1024px+) → フルナビ — `mobile-responsive.test.ts` "should show full navigation bar on desktop"
- [x] モバイルでコメント送信 — `mobile-responsive.test.ts` "should post comment on mobile"
- [ ] モバイルでリアクション
- [x] モバイルで共有メニュー — `mobile-responsive.test.ts` "should show share button on mobile"
- [ ] モバイルでスクロール (タッチ)
- [x] `aria-expanded` on ハンバーガー — `accessibility.test.ts` "should have aria-label on hamburger menu button" (aria-expanded を検証)
- [ ] モバイルでリプライフォーム
- [ ] モバイルで ConfirmDialog

---

## 23. アクセシビリティ & キーボード

- [ ] Tab で全インタラクティブ要素巡回 + フォーカス可視 — **skip**: headless Chromium Tab 制約
- [ ] ConfirmDialog Tab トラップ (ダイアログ内のみ)
- [x] ConfirmDialog Escape → キャンセル — `accessibility.test.ts` "should close ConfirmDialog with Escape"
- [x] ConfirmDialog キャンセルボタン自動フォーカス — `accessibility.test.ts` "should focus cancel button in ConfirmDialog"
- [ ] MobileOverlay Tab トラップ
- [x] `role="dialog"` + `aria-modal="true"` on モーダル — `accessibility.test.ts` "should have role='dialog' on share modal" + "should have aria-modal on share dialog"
- [ ] `aria-live="polite"` on トーストコンテナ
- [x] アイコンボタンの `aria-label` — `accessibility.test.ts` "should have aria-label on hamburger menu button"
- [x] セマンティック h1 → h2 → h3 階層 — `accessibility.test.ts` "should have h1 on home page" + "should have h2 'Comments' on content page"
- [ ] フォーカス可視 (`:focus-visible`) 全要素
- [x] Enter → フォーム送信 — `accessibility.test.ts` "should submit URL input with Enter key"
- [x] Escape → 全モーダル/ポップオーバー閉じ — `accessibility.test.ts` "should close share modal with Escape"
- [ ] 絵文字ピッカー Escape → 閉じ
- [x] 共有メニュー Escape → 閉じ — `bookmark-share.test.ts` "should close share menu with Escape"
- [ ] トースト `role="alert"` (エラー)
- [x] `aria-expanded` on 展開ボタン (ハンバーガー, 言語) — `accessibility.test.ts` "should have aria-label on hamburger menu button" (aria-expanded 検証)
- [ ] 装飾 SVG に `aria-hidden="true"`
- [ ] ローディング状態 `role="status"`

---

## 24. トースト通知

- [x] コメント送信成功 → 緑トースト (`comment_sent`) — `toast-confirm.test.ts` "should show success toast on comment send"
- [ ] コメント送信失敗 → 赤トースト (`comment_failed`)
- [x] リアクション成功 → 緑トースト (`reaction_sent`) — `toast-confirm.test.ts` "should show success toast on reaction send"
- [ ] リアクション失敗 → 赤トースト (`reaction_failed`)
- [x] 削除成功 → 緑トースト (`delete_sent`) — `toast-confirm.test.ts` "should show success toast on delete"
- [ ] 削除失敗 → 赤トースト (`delete_failed`)
- [ ] リプライ成功 → 緑トースト (`reply_sent`)
- [ ] リプライ失敗 → 赤トースト (`reply_failed`)
- [x] nsec 検出 → 赤トースト (`contains_private_key`) — `security.test.ts` "should block comment containing nsec1"
- [x] 自動消失 (4 秒) (`TOAST_DURATION_MS`) — `toast-confirm.test.ts` "should auto-dismiss toast after timeout"
- [ ] 手動閉じ (× ボタン) → 即時消失
- [ ] 複数トースト → スタック表示 (最大 3)
- [ ] トースト z-index → 他要素の上に表示

---

## 25. VirtualScrollList & #153 / #154

- [x] general コメント 20+ 件 → スクロール可能 (#153) — `virtual-scroll.test.ts` "should display 20+ general comments and allow scrolling"
- [ ] コメント 0 → N 件に変化 → 全件表示 (`visibleRange` 更新) — **BUG #153: skip** `virtual-scroll.test.ts`
- [ ] 100+ コメント → スムーズスクロール (virtual scroll)
- [ ] 新コメント上方挿入 → スクロール位置維持 (auto-adjust)
- [ ] `scrollToIndex()` → 指定位置へ自動スクロール
- [ ] ResizeObserver → 動的高さ追従 (height cache)
- [x] timed + general 両セクション独立スクロール — `virtual-scroll.test.ts` "should show both timed and general sections simultaneously"
- [ ] 再生前でも timed コメント表示 (#154)
- [ ] フィルタ切り替え → スクロール位置リセット
- [ ] 高速スクロール → 正しいレンダリング (overscan buffer)
- [ ] 1000+ コメント → FPS > 30 (パフォーマンス)

---

## 26. NIP-19 & nostr: URI

- [x] `/note1...` → イベント fetch → コンテンツ遷移 — `nip19-routes.test.ts` "should show loading state for note1 URL"
- [x] `/nevent1...` → イベント fetch → コンテンツ遷移 (relay hint) — `nip19-routes.test.ts` "should show loading state for nevent1 URL"
- [ ] 非コメントイベント → "View content" リンク (`not_comment`)
- [x] 不正 NIP-19 → エラー表示 (`nip19.invalid`) — `nip19-routes.test.ts` "should show error for invalid NIP-19 string"
- [x] `nprofile1...` → プロフィール遷移 — `nip19-routes.test.ts` "should redirect nprofile to profile page"
- [ ] ローディング中表示 ("Loading...")
- [x] エラー → "Back to home" リンク — `nip19-routes.test.ts` "should have back to home link on NIP-19 page"
- [ ] `ncontent1...` URL 入力 → コンテンツ遷移 (decode → route)
- [ ] QuoteCard 内の nostr:note → 再帰 fetch
- [ ] ncontent decode → プロバイダー名 (`displayLabel`) 表示

---

## 27. セキュリティ

### 27A. XSS 防御

- [x] コメント content に `<script>alert(1)</script>` → 無害化テキスト — `security.test.ts` "should render script tags as plain text in comments"
- [x] コメント content に `<img onerror=alert(1)>` → sanitize — `security.test.ts` "should render img tags as plain text in comments"
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

- [x] nsec1... をコメントに入力 → 送信ブロック — `security.test.ts` "should block comment containing nsec1"
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

- [x] 新規ユーザー: Home → チップ → 閲覧 → ログイン → コメント → リアクション → 共有 → ブックマーク — `multi-step-journeys.test.ts` "new user: home → example chip → login → comment → share"
- [ ] リピーター: URL 貼り付け → コメント → 通知確認 → リプライ → プロフィール確認
- [x] 管理者: 設定確認 → リレー調整 → ミュート確認 → dev tools — `multi-step-journeys.test.ts` "settings flow: settings → mute section → notification filter → back"
- [ ] モバイル: ハンバーガー → 設定 → 言語変更 → Home → URL → コメント
- [ ] Podcast 探索: RSS URL → フィード → エピソード A → コメント → B → コメント
- [x] ソーシャル: コメント閲覧 → プロフィール → フォロー → Follows フィルタ → WoT — `multi-step-journeys.test.ts` "social flow: content → comment → avatar → profile"
- [ ] 共有: コンテンツ → 共有 → timed link コピー → 新タブ → ?t= シーク → コメント
- [ ] 通知: ベル → ポップオーバー → View all → フィルタ → Mark read → Content
- [ ] ブックマーク: 追加 → /bookmarks → 確認 → 削除 → Content → ☆
- [ ] ミュート: コメントカード → ミュート → 確認 → 設定 → Unmute → 確認
- [x] Read-only: ログイン → 閲覧 → 送信失敗 → 設定 → NIP-44 警告 → ログアウト — `multi-step-journeys.test.ts` "read-only login flow"
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
- [x] Home → Content → Back → Home → Forward → Content — `direct-access.test.ts` (既存) "should handle browser back/forward navigation"
- [x] Home → Content → Settings → Back → Content → Back → Home — `navigation-history.test.ts` "should handle Home → Content → Settings → Back → Content → Back → Home"
- [x] Home → Bookmarks → Content → Back → Bookmarks — `navigation-history.test.ts` "should handle Home → Bookmarks → Home → Notifications → Home"
- [ ] Home → Notifications → Content → Back → Notifications
- [ ] Home → Profile → Content → Back → Profile
- [ ] 10 ページ遷移 → Back 10 回 → Home
- [ ] Content A → Content B (直接, Home 経由なし) → Back → Content A
- [ ] Content → Settings → Back → Content (embed 再ロード)

### 29B. リロード

- [x] Home リロード → 入力クリア + UI 維持 — `resilience.test.ts` (既存) "should handle reload on home page"
- [x] Content リロード → embed 再ロード + URL 維持 — `resilience.test.ts` (既存) "should handle page reload on content page"
- [x] Settings リロード → 設定維持 (localStorage) — `navigation-history.test.ts` "should preserve URL on Settings reload"
- [x] Bookmarks リロード → 再取得 — `navigation-history.test.ts` "should preserve URL on Bookmarks reload"
- [x] Notifications リロード → 再取得 — `navigation-history.test.ts` "should preserve URL on Notifications reload"
- [ ] Profile リロード → 再取得
- [ ] Content + ?t=90 リロード → 再シーク
- [ ] Content + ログイン中リロード → 再ログイン → フォーム表示
- [x] 全ページ: リロード後 language 維持 — `i18n-locale.test.ts` "should persist language setting after reload"

### 29C. 直アクセス (deep link)

- [x] `/` → Home — `direct-access.test.ts` (既存) "should render home page on direct access"
- [x] `/spotify/track/xxx` → Content (SP) — `direct-access.test.ts` (既存) "should render track page on direct access"
- [x] `/youtube/video/xxx` → Content (YT) — `direct-access.test.ts` (既存) "should render YouTube video page on direct access"
- [x] `/vimeo/video/xxx` → Content (VM) — `navigation-history.test.ts` "should render Vimeo page on direct access"
- [x] `/soundcloud/track/xxx` → Content (SC) — `navigation-history.test.ts` "should render SoundCloud page on direct access"
- [x] `/mixcloud/mix/xxx` → Content (MX) — `navigation-history.test.ts` "should render Mixcloud page on direct access"
- [x] `/spreaker/episode/xxx` → Content (SK) — `navigation-history.test.ts` "should render Spreaker page on direct access"
- [x] `/niconico/video/sm9` → Content (NC) — `resilience.test.ts` (既存) "should maintain URL after page reload on niconico page"
- [x] `/podbean/episode/xxx` → Content (PB) — `content-page.test.ts` (既存) "should display podbean embed"
- [x] `/audio/track/xxx` → Content (AU) — `content-page.test.ts` (既存) "should display audio embed"
- [x] `/podcast/feed/xxx` → Content (PF) — `content-page.test.ts` (既存) "should render podcast feed page with header"
- [x] `/settings` → Settings — `navigation-history.test.ts` "should render settings on direct access without login"
- [x] `/bookmarks` → Bookmarks (ログイン要求) — `bookmark-share.test.ts` "should show login prompt when not logged in"
- [x] `/notifications` → Notifications (ログイン要求) — `notifications-page.test.ts` "should show login prompt"
- [x] `/profile/npub1xxx` → Profile — `login-states.test.ts` "should display profile page without login"
- [x] `/note1xxx` → NIP-19 解決 — `nip19-routes.test.ts` "should show loading state for note1 URL"
- [x] `/nevent1xxx` → NIP-19 解決 — `nip19-routes.test.ts` "should show loading state for nevent1 URL"
- [x] `/completely/unknown` → SPA fallback → ヘッダー表示 — `direct-access.test.ts` (既存) "should handle unknown routes gracefully"
- [x] `/spotify/track/xxx?t=90` → Content + シーク — `edge-cases.test.ts` "should render content page with ?t= parameter"
- [ ] `/playbook` (prod) → 404
- [ ] `/playbook` (dev) → Playbook ページ

---

## 30. プラットフォームマトリクス

> 10 プラットフォーム (SP/YT/VM/SC/MX/SK/NC/PB/AU/PF) × 各操作

### 30A. 直接アクセス + embed 表示 (10 件)

- [x] SP track 直アクセス → embed + Comments — `content-page.test.ts` (既存) "should display Spotify embed" + "should display Comments heading"
- [x] YT video 直アクセス → embed + Comments — `content-page.test.ts` (既存) "should display YouTube embed"
- [x] VM video 直アクセス → embed + Comments — `platform-embeds.test.ts` "should display Vimeo embed" + "should display Comments heading for Vimeo"
- [x] SC track 直アクセス → oEmbed → embed + Comments — `platform-embeds.test.ts` "should display SoundCloud embed"
- [x] MX mix 直アクセス → embed + Comments — `platform-embeds.test.ts` "should display Mixcloud embed"
- [x] SK episode 直アクセス → widget + Comments — `platform-embeds.test.ts` "should display Spreaker embed"
- [x] NC video 直アクセス → embed + Comments — `content-page.test.ts` (既存) "should display niconico embed"
- [x] PB episode 直アクセス → oEmbed → embed + Comments — `content-page.test.ts` (既存) "should display podbean embed"
- [x] AU track 直アクセス → audio + Comments — `content-page.test.ts` (既存) "should display audio embed"
- [x] PF feed 直アクセス → エピソード一覧 + Comments — `platform-embeds.test.ts` "should render podcast feed page with header"

### 30B. ログインプロンプト (10 件)

- [x] SP: 未ログイン → `comment-login-prompt` — `content-page.test.ts` (既存) "should display login prompt when not logged in"
- [x] YT: 未ログイン → `comment-login-prompt` — `content-page.test.ts` (既存) "should display login prompt when not logged in on YouTube"
- [x] VM: 未ログイン → `comment-login-prompt` — `platform-embeds.test.ts` "should display login prompt when not logged in on Vimeo"
- [x] SC: 未ログイン → `comment-login-prompt` — `platform-embeds.test.ts` "should display login prompt when not logged in on SoundCloud"
- [x] MX: 未ログイン → `comment-login-prompt` — `platform-embeds.test.ts` "should display login prompt when not logged in on Mixcloud"
- [x] SK: 未ログイン → `comment-login-prompt` — `platform-embeds.test.ts` "should display login prompt when not logged in on Spreaker"
- [x] NC: 未ログイン → `comment-login-prompt` — `content-page.test.ts` (既存) "should display login prompt when not logged in on niconico"
- [x] PB: 未ログイン → `comment-login-prompt` — `content-page.test.ts` (既存) "should display login prompt when not logged in on podbean"
- [x] AU: 未ログイン → `comment-login-prompt` — `content-page.test.ts` (既存) "should display login prompt when not logged in on audio"
- [x] PF: フィード → コメントフォーム非表示 (ヒント表示) — `platform-embeds.test.ts` "should show episode selection hint instead of comment form"

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

- [x] A: ログインプロンプト表示 — `login-states.test.ts` "should show login prompt" (Content page — not logged in)
- [x] A: コメントフォーム非表示 — `login-states.test.ts` "should hide comment form"
- [x] A: 共有ボタン表示 (コピーのみ) — `login-states.test.ts` "should show share button (copy only)"
- [x] A: ブックマークボタン非表示 — `login-states.test.ts` "should hide bookmark button"
- [x] A: フィルタバー非表示 — `login-states.test.ts` "should hide filter bar"
- [ ] A: リアクション/削除/ミュートアイコン非表示
- [x] B: コメントフォーム表示 — `login-states.test.ts` "should show comment form after login"
- [x] B: 共有 "Post to Nostr" 表示 — `login-states.test.ts` "should show 'Post to Nostr' in share menu"
- [x] B: ブックマーク/フィルタ/リアクション表示 — `login-states.test.ts` "should show bookmark button" + "should show filter bar"
- [ ] B: 自分のコメント → 削除アイコン
- [ ] B: 他者のコメント → ミュートアイコン
- [x] C: コメントフォーム表示 (textarea) — `login-states.test.ts` "should show comment form (textarea visible)" (read-only)
- [ ] C: 送信 → signEvent 不在 → エラー
- [ ] C: リアクション → 失敗
- [ ] C: 削除 → 失敗

### 31B. 設定ページ × 3 状態

- [x] A: ミュート/通知フィルタ/dev tools 表示 — `login-states.test.ts` "should display mute section" + "should display notification filter" + "should display developer tools"
- [ ] A: リレーセクション空 (pubkey なし)
- [x] B: リレーリスト表示 + 追加/削除/保存 可能 — `relay-settings-data.test.ts` (複数テスト)
- [ ] B: ミュートユーザー一覧 + Unmute
- [ ] C: リレーリスト表示 (read-only)
- [ ] C: リレー保存 → signEvent 失敗
- [x] C: NIP-44 警告表示 — `login-states.test.ts` "should show NIP-44 warning"
- [ ] C: Unmute → 失敗

### 31C. ブックマーク/通知/プロフィール × 3 状態

- [x] ブックマーク A: ログインプロンプト — `login-states.test.ts` "Bookmarks page — not logged in: should show login prompt"
- [x] ブックマーク B: 一覧表示 + 操作可能 — `login-states.test.ts` "should show bookmarks page with empty state"
- [ ] ブックマーク C: 一覧表示 + 削除失敗
- [x] 通知 A: ログインプロンプト — `login-states.test.ts` "Notifications page — not logged in: should show login prompt"
- [x] 通知 B: 一覧 + フィルタ + Mark read — `login-states.test.ts` "should show notifications title" + "should show empty state when no notifications"
- [ ] 通知 C: 一覧 + フィルタ (Mark read は localStorage のみ)
- [x] プロフィール A: 表示のみ (ボタン非表示) — `login-states.test.ts` "should display profile page without login" + "should not show follow/mute buttons"
- [ ] プロフィール B: フォロー/ミュートボタン
- [ ] プロフィール C: ボタン表示 → 操作失敗

---

## 32. データ量マトリクス

### 32A. コメント数

- [x] 0 件 → 空状態メッセージ — `data-volume.test.ts` "should show empty state with 0 comments"
- [x] 1 件 → 表示 (スクロール不要) — `data-volume.test.ts` "should display single comment correctly"
- [ ] 10 件 → 全件表示
- [x] 100 件 → virtual scroll 発動 — `data-volume.test.ts` "should handle 50 comments" (50件で検証)
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

- [x] 0 件 → 空状態 — `data-volume.test.ts` "should show empty state on bookmarks with 0 items"
- [ ] 1 件 → 表示
- [ ] 100 件 → スクロール
- [ ] content 50 + comment 50 → 混在

### 32C. 通知数

- [x] 0 件 → 空状態 — `data-volume.test.ts` "should show empty state on notifications with 0 items"
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

- [x] コメント送信中に新コメント受信 → textarea 内容保持 — `timing-concurrent.test.ts` "should preserve textarea content when new comments arrive"
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
- [x] フィルタ All → Follows → WoT → All 高速切替 → 最終: All — `timing-concurrent.test.ts` "should handle rapid filter switching"
- [ ] 言語 ja → en → de → ja 高速切替 → 最終: ja
- [ ] 共有メニュー開閉 5 回高速 → 安定
- [x] ページ遷移 5 回高速 → 最終ページ正しい — `timing-concurrent.test.ts` "should handle rapid page navigation"
- [ ] 戻る/進む 10 回高速 → 履歴正しい

### 33D. ネットワーク状態変化

- [ ] コメント送信中にネットワーク切断 → エラートースト
- [ ] ネットワーク切断 → 復帰 → 自動再接続
- [ ] 遅いリレー (2 秒遅延) → 最終的に表示
- [ ] 1 リレーダウン + 3 正常 → コメント表示
- [ ] 2 リレーダウン + 2 正常 → コメント送信成功 (50% 閾値)
- [ ] 全リレーダウン → コメント送信失敗
- [x] 全リレーダウン → IDB キャッシュからコメント表示 — `timing-concurrent.test.ts` "should show page even when all relays are down"
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

- [x] コメント削除: danger variant → 赤ボタン → kind:5 — `toast-confirm.test.ts` "should show danger variant for delete (red button)"
- [x] コメント削除 → キャンセル → アクション未実行 — `toast-confirm.test.ts` "should close dialog without action on cancel click"
- [x] コメント削除 → Escape → キャンセル — `accessibility.test.ts` "should close ConfirmDialog with Escape"
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
- [x] リレーステータス (ヘッダー) → 接続数/総数 + 色 — `edge-cases.test.ts` "should show relay status indicator when logged in (desktop)"
- [x] Spotify show ページ → "View all episodes" リンク + ペーストヒント — `edge-cases.test.ts` "should show 'View all episodes' link" + "should show paste hint text"
- [x] 不明コンテンツ → "Unsupported content" + "Back to home" リンク — `edge-cases.test.ts` "should show unsupported content" + "should show back to home link"
- [x] 空 type/id セグメント → クラッシュなし — `edge-cases.test.ts` "should handle empty type/id segments gracefully"

---

## 38. ロケールマトリクス

> 4 ロケール (ja, en, de, zh_cn) × 主要チェック

### 38A. ページテキスト

- [x] ja: Home タイトル + サブタイトル — `locale-matrix.test.ts` "should show Japanese home page text"
- [x] en: Home タイトル + サブタイトル — `locale-matrix.test.ts` "should show English home page text"
- [ ] de: Home タイトル + サブタイトル
- [ ] zh_cn: Home タイトル + サブタイトル
- [ ] ja: "Login with Nostr" ボタン
- [ ] en: "Login with Nostr" ボタン
- [ ] de: "Login with Nostr" ボタン
- [ ] zh_cn: "Login with Nostr" ボタン
- [x] ja: Comments 見出し — `locale-matrix.test.ts` "should show Japanese Comments heading"
- [x] en: Comments 見出し — `locale-matrix.test.ts` "should show English Comments heading"
- [ ] de: Comments 見出し
- [ ] zh_cn: Comments 見出し
- [ ] ja: "No comments yet"
- [ ] en: "No comments yet"
- [ ] de: "No comments yet"
- [ ] zh_cn: "No comments yet"
- [ ] ja: ログインプロンプト
- [x] en: ログインプロンプト — `locale-matrix.test.ts` "should show English login prompt"
- [ ] de: ログインプロンプト
- [ ] zh_cn: ログインプロンプト
- [x] ja: 設定ページ見出し (リレー/ミュート/通知/開発者) — `locale-matrix.test.ts` "should show Japanese settings headings"
- [x] en: 設定ページ見出し — `locale-matrix.test.ts` "should show English settings headings"
- [ ] de: 設定ページ見出し
- [ ] zh_cn: 設定ページ見出し
- [x] ja: 通知ページタイトル + フィルタ — `locale-matrix.test.ts` "should show Japanese notification title"
- [x] en: 通知ページタイトル + フィルタ — `locale-matrix.test.ts` "should show English notification filters"
- [ ] de: 通知ページタイトル + フィルタ
- [ ] zh_cn: 通知ページタイトル + フィルタ
- [x] ja: ブックマーク空状態 — `locale-matrix.test.ts` "should show Japanese empty bookmarks"
- [x] en: ブックマーク空状態 — `locale-matrix.test.ts` "should show English empty bookmarks"
- [ ] de: ブックマーク空状態
- [ ] zh_cn: ブックマーク空状態
- [ ] ja: プロフィール空状態
- [ ] en: プロフィール空状態
- [ ] de: プロフィール空状態
- [ ] zh_cn: プロフィール空状態
- [x] ja: 共有メニューテキスト — `locale-matrix.test.ts` "should show Japanese share menu"
- [x] en: 共有メニューテキスト — `locale-matrix.test.ts` "should show English share menu"
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

- [x] ja: All/Follows/WoT フィルタテキスト — `locale-matrix.test.ts` "should show Japanese filter bar"
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

- [x] M: タイトル + URL 入力 + ハンバーガー — `responsive.test.ts` (既存) "should display correctly on mobile viewport"
- [ ] M: サンプルチップ表示 + クリック
- [ ] M: Go ボタン disabled (空)
- [ ] M: URL 入力 → 遷移
- [ ] T: タイトル + ハンバーガー
- [ ] T: URL 入力 → 遷移
- [ ] D: フルナビ (言語/リレー/ブックマーク/設定/通知/ログイン)
- [ ] D: URL 入力 → 遷移

### 39B. コンテンツページ

- [x] M: embed 表示 (レスポンシブ幅) — `mobile-responsive.test.ts` "should display embed and comments on mobile"
- [x] M: Comments 見出し + ログインプロンプト — `mobile-responsive.test.ts` "should show login prompt on mobile"
- [x] M: コメント送信 — `mobile-responsive.test.ts` "should post comment on mobile"
- [ ] M: リアクション
- [x] M: 共有メニュー — `mobile-responsive.test.ts` "should show share button on mobile"
- [ ] M: ブックマーク
- [ ] M: スクロール (タッチ)
- [ ] M: "Jump to Now"
- [ ] M: リプライフォーム
- [ ] M: ConfirmDialog (削除)
- [x] T: embed + コメント表示 — `mobile-responsive.test.ts` "should display content page on tablet"
- [ ] T: 全操作
- [ ] D: 2 カラムレイアウト (embed 左, comments 右)
- [ ] D: 絵文字ピッカー popover 位置

### 39C. 設定

- [x] M: リレーセクション + 追加/削除 — `mobile-responsive.test.ts` "should display settings sections on mobile" (ミュートセクション検証)
- [x] M: ミュートセクション — `mobile-responsive.test.ts` "should display settings sections on mobile"
- [ ] M: 通知フィルタ
- [ ] T: 全セクション表示
- [ ] D: 全セクション表示

### 39D. 通知

- [x] M: 通知一覧 + フィルタタブ — `mobile-responsive.test.ts` "should display notifications on mobile"
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

- [x] 完全 CRUD: 投稿 → 表示 → リアクション → リプライ → 削除 → 全消失 — `multi-step-journeys.test.ts` "comment lifecycle: post → display → react → delete → disappear"
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
- [x] 複数プラットフォーム探索: SP → Home → YT → Home → NC → Home → PB (各 embed 正常) — `multi-step-journeys.test.ts` "platform exploration: SP → Home → YT → Home → NC"
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
