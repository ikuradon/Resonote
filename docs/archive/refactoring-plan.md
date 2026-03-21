# Resonote 全面リファクタリング詳細実行計画書

最終更新: 2026-03-20
対象リポジトリ: `Resonote`
文書の目的: 現在のコードベースを安全に、段階的に、最終的に一貫した構造へ整理し切るための実行計画を明文化する

## 1. この文書の位置づけ

この文書は「今後どう直すか」の希望ではなく、実際に手を動かすときの作業基準です。

この文書で決めること:

- どこまでを「全面リファクタリング完了」とみなすか
- 何を先に分離し、何を後回しにするか
- どの層に何を書いてよいか
- 既存コードをどの単位で移すか
- 途中段階で許す暫定構成と、許さない逆流
- フェーズごとの完了条件

この文書は、既存の `docs/refactoring-plan.md` を読み、2026-03-20 時点のソースコードを確認した上で詳細化したものです。

## 2. 結論

採用する方針は次の 6 点です。

1. 先に実行環境を固定する
2. `src/app` / `src/features` / `src/shared` を正式な境界として運用する
3. `src/lib` は新規実装先ではなく、移行中の互換レイヤーとして扱う
4. `comments` を中途半端な facade で止めず、縦に完了させる
5. route と layout からオーケストレーションを抜き切る
6. `bookmarks` / `follows` / `notifications` / `relays` / `extension` / `sharing` まで同じルールで広げる

重要なのは、`features/` を増やすこと自体ではありません。
最終目標は「責務の境界が逆流しない状態」を作ることです。

## 3. 2026-03-20 時点の現状診断

### 3.1 進んでいること

既に始まっている改善もあります。

- `src/features/comments/domain/` に comments の pure function と型が導入されている
- `src/features/content-resolution/` に result 型と orchestrator の入口が作られている
- `src/app/bootstrap/init-session.ts` が導入され、ログイン後初期化の入口が作られている
- `CommentForm.svelte` と `CommentList.svelte` から、コメント送信の一部が `features/comments/application/comment-actions.ts` に移されている

これは良い進展です。完全なゼロベースの再設計は不要です。

### 3.2 まだ未完了のこと

一方で、現状は「新しい住所を作り始めた段階」で止まっています。

#### 問題1: `comments` の実体がまだ旧 store に残っている

`src/lib/stores/comments.svelte.ts` は次をまだ保持しています。

- live subscription
- IndexedDB restore
- deletion reconcile
- reaction index 更新
- addSubscription
- destroy lifecycle

つまり `domain` だけが新構造に移った状態で、実体は依然として旧構造にあります。

#### 問題2: route がまだ composition root になっていない

`src/web/routes/[platform]/[type]/[id]/+page.svelte` は次をまだ直接扱っています。

- bookmark の on/off
- player 初期シーク
- comments store の生成と破棄
- podcast episode resolve
- audio resolve
- signed event publish
- resolved path への URL rewrite
- additional subscription の追加

この route は表示合成ではなく、依然としてアプリケーションサービスです。

#### 問題3: layout が通知購読の副作用を抱えている

`src/web/routes/+layout.svelte` は次を持っています。

- auth / follows 変化を見た通知購読開始
- 購読開始タイミング調整用の timeout
- logout 時の通知破棄
- pending publish retry
- extension listener 初期化

layout は app shell のはずですが、まだ bootstrap 実装の一部になっています。

#### 問題4: `features` がまだ `src/lib` に直接依存している

例:

- `src/features/comments/application/comment-actions.ts`
- `src/features/content-resolution/application/resolve-content.ts`
- `src/features/comments/domain/comment-mappers.ts`

これらは依然として `src/lib/nostr/*`, `src/lib/content/*`, `src/lib/utils/*` に直接依存しています。

今の `features/` は境界ではなく、単なる別ディレクトリです。

#### 問題5: `src/shared` がまだ存在しない

現状のディレクトリ構成には `src/shared/` がありません。
そのため shared であるべき code が `src/lib/` に残り、`lib` と `feature` の境界が曖昧なままです。

#### 問題6: UI から infra 直結が残っている

例:

- `src/lib/components/ShareButton.svelte` が `castSigned` を直接使う
- `src/lib/components/PodbeanEmbed.svelte` が `/api/podbean/resolve` を直接叩く
- 各種 embed が `window` イベントを生で扱う
- `CommentList.svelte` が filter, seek, mute, profile load, reply state を大量に持つ

comments だけ分離しても、UI 全体の責務分離はまだ達成できていません。

#### 問題7: `bookmarks` / `follows` / `notifications` / `relays` が旧 store 構造のまま

次のファイルには state, query, publish, cache, subscription が混在しています。

- `src/lib/stores/bookmarks.svelte.ts`
- `src/lib/stores/follows.svelte.ts`
- `src/lib/stores/notifications.svelte.ts`
- `src/lib/stores/relays.svelte.ts`
- `src/lib/stores/extension.svelte.ts`

`comments` と同じ問題が別機能に残っています。

#### 問題8: 実行環境が固定されていない

`package.json` は Node `>=24.0.0` を要求しています。

しかし 2026-03-20 の確認では:

- `node -v` は `v24.14.0`
- `pnpm check` は Node `v20.11.1` と認識して失敗
- `pnpm test` も同様に失敗
- `.nvmrc` / `.node-version` / `.tool-versions` は未配置

つまり「シェルの Node」と「pnpm が使う Node」が一致していません。
この状態ではリファクタリングの回帰確認ができません。

#### 問題9: coverage 対象が旧構造前提

`vite.config.ts` の coverage 対象は `src/lib/**/*.ts` 中心です。
今後コードを `src/features/**` や `src/app/**` へ移すなら、coverage 設定も追従させる必要があります。

## 4. 今回の全面リファクタリングで達成する状態

全面リファクタリング完了の定義は次です。

- route と layout が画面合成と起動タイミング制御だけを持つ
- `comments` が `domain / application / infra / ui` に分離されている
- content resolution が route と component から分離されている
- auth 後初期化の順序が 1 か所で追える
- `bookmarks` / `follows` / `notifications` / `relays` / `extension` が feature 単位で整理されている
- UI component から `castSigned`, `getRxNostr`, `getEventsDB`, `fetch('/api/...')` の直接依存が消えている
- `src/lib/stores` が巨大な業務ロジック置き場ではなくなっている
- Node 24 環境で `pnpm check`, `pnpm test`, 必要な smoke E2E が通る

## 5. 目標アーキテクチャ

### 5.1 依存方向

依存方向は次に固定します。

```text
web routes / layouts
  -> app
  -> features
  -> shared

app
  -> features
  -> shared

features
  -> shared

shared
  -> shared

extension
  -> features(extension-bridge / playback など必要最小限)
  -> shared

functions
  -> shared (純粋型・共通変換のみ)
```

禁止する依存:

- `shared -> features`
- `feature A -> feature B の ui/infra`
- `ui -> infra`
- `route/layout -> rx-nostr / IndexedDB / raw fetch`

### 5.2 層の意味

#### `domain`

- 純粋関数
- 型
- 判定ルール
- 変換ルール
- 集計ロジック

ここに入れないもの:

- `fetch`
- `IndexedDB`
- `window`
- `document`
- `rx-nostr`

#### `application`

- ユースケース
- 複数 domain / infra の組み合わせ
- 処理順序
- リトライ
- cancellation

#### `infra`

- Nostr gateway
- IndexedDB repository
- API client
- browser extension messaging
- clipboard
- service worker

#### `ui`

- Svelte component
- view model
- UI state
- callback wiring

### 5.3 ディレクトリ目標

```text
src/
  app/
    bootstrap/
    routing/
    session/
    navigation/
  features/
    auth/
      application/
      infra/
      ui/
    comments/
      domain/
      application/
      infra/
      ui/
    content-resolution/
      domain/
      application/
      infra/
      ui/
    bookmarks/
      domain/
      application/
      infra/
      ui/
    follows/
      domain/
      application/
      infra/
      ui/
    notifications/
      domain/
      application/
      infra/
      ui/
    relays/
      domain/
      application/
      infra/
      ui/
    profiles/
      domain/
      application/
      infra/
      ui/
    sharing/
      application/
      infra/
      ui/
    playback/
      application/
      infra/
      ui/
    extension-bridge/
      application/
      infra/
      ui/
  shared/
    content/
    nostr/
    browser/
    utils/
    ui/
    testing/
```

## 6. import / alias 方針

### 6.1 alias を追加する

SvelteKit の `$lib` だけでは、`src/lib` が「共有」なのか「旧構造」なのか判断できません。
したがって、早期に次の alias を導入します。

- `$appcore` -> `src/app`
- `$features` -> `src/features`
- `$shared` -> `src/shared`
- `$extension` -> `src/extension`

`$lib` は移行中のみ許容する互換 alias とします。

### 6.2 `src/lib` の扱い

`src/lib` は直ちに消しません。
ただし今後の方針は次です。

- 新しい業務ロジックは `src/lib` に追加しない
- `src/lib/stores` は新規 feature 実装先にしない
- `src/lib/components` は feature UI を置く場所にしない
- 実体を `src/shared` / `src/features` へ移したら、必要に応じて `src/lib` から re-export のみ残す

## 7. 守るべき設計ルール

### 7.1 route / layout は composition root

`+page.svelte` と `+layout.svelte` が行うこと:

- feature facade / view model を呼ぶ
- props を渡す
- ページごとの表示を組み立てる
- route param や URL search param を feature へ受け渡す

書いてはいけないこと:

- `getRxNostr`, `castSigned`, `getEventsDB`
- raw `fetch('/api/...')`
- 複数段の fallback resolve
- 購読の詳細
- timeout を含む副作用の調停

### 7.2 UI component から infra を直接触らない

UI で禁止するもの:

- `castSigned`
- `getRxNostr`
- `getEventsDB`
- `fetch('/api/...')`
- `window.postMessage`
- 生の extension message schema

### 7.3 store の役割を限定する

`.svelte.ts` で許す責務は次のどちらかです。

- view model
- app shell state

同時に持たせない責務:

- DB repository
- relay query
- publish 処理
- long-lived subscription manager
- transport

### 7.4 domain には副作用を入れない

`domain` は unit test の中心です。
コメント、通知、bookmark などの判定ロジックはここへ寄せます。

### 7.5 feature は shared のみを参照する

feature 間の直接依存が必要なら、次のどちらかに整理します。

- app で合成する
- 共通部分を shared へ上げる

### 7.6 暫定 wrapper には期限を付ける

移行中に wrapper を置く場合は、必ず次をコメントで残します。

- 元実装の移動先
- wrapper を削除する phase
- wrapper が存在する理由

### 7.7 新規実装禁止ゾーン

移行開始後、新規の業務ロジックを追加してはいけない場所:

- `src/lib/stores/comments.svelte.ts`
- `src/lib/stores/bookmarks.svelte.ts`
- `src/lib/stores/follows.svelte.ts`
- `src/lib/stores/notifications.svelte.ts`
- `src/lib/stores/relays.svelte.ts`
- `src/lib/stores/extension.svelte.ts`
- `src/web/routes/[platform]/[type]/[id]/+page.svelte`
- `src/web/routes/+layout.svelte`

## 8. 現在コードからの移行マップ

### 8.1 comments

現状の主対象:

- `src/lib/stores/comments.svelte.ts`
- `src/lib/components/CommentList.svelte`
- `src/lib/components/CommentForm.svelte`

移行先:

```text
src/features/comments/
  domain/
    comment-model.ts
    comment-mappers.ts
    deletion-rules.ts
    reaction-rules.ts
  application/
    comment-actions.ts
    comment-subscription.ts
    comment-merge.ts
  infra/
    comment-event-gateway.ts
    comment-repository.ts
  ui/
    comment-view-model.svelte.ts
    CommentTimeline.svelte
    CommentComposer.svelte
```

補足:

- `comment-mappers.ts` が使う `parsePosition`, `isEmojiTag` は shared へ移す
- `createCommentsStore()` は最終的に削除、または `createCommentViewModel()` への互換 wrapper に縮小する

### 8.2 content resolution

現状の主対象:

- `src/features/content-resolution/application/resolve-content.ts`
- `src/lib/content/podcast-resolver.ts`
- `src/web/routes/[platform]/[type]/[id]/+page.svelte`
- `src/lib/components/PodcastEpisodeList.svelte`
- `src/lib/components/PodbeanEmbed.svelte`

移行先:

```text
src/features/content-resolution/
  domain/
    resolution-result.ts
    resolution-rules.ts
  application/
    resolve-content.ts
    resolve-audio.ts
    resolve-podcast-episode.ts
    apply-resolution.ts
  infra/
    bookmark-resolution-repository.ts
    podcast-api-client.ts
    podbean-api-client.ts
    resolution-publisher.ts
  ui/
    resolved-content-view-model.svelte.ts
```

補足:

- `signedEvents` の publish は route ではなく feature 内で完結させる
- `resolvedPath` 適用も feature facade の責務としてよい

### 8.3 auth / session / notifications

現状の主対象:

- `src/lib/stores/auth.svelte.ts`
- `src/app/bootstrap/init-session.ts`
- `src/web/routes/+layout.svelte`
- `src/lib/stores/notifications.svelte.ts`

移行先:

```text
src/features/auth/
  application/
    auth-controller.ts
  infra/
    nostr-login-gateway.ts
  ui/
    auth-state.svelte.ts

src/features/notifications/
  domain/
    notification-classifier.ts
  application/
    notification-subscription.ts
  infra/
    notification-event-gateway.ts
  ui/
    notifications-view-model.svelte.ts

src/app/bootstrap/
  init-app.ts
  init-session.ts
  init-notifications.ts
```

### 8.4 bookmarks / follows / relays / profiles

現状の主対象:

- `src/lib/stores/bookmarks.svelte.ts`
- `src/lib/stores/follows.svelte.ts`
- `src/lib/stores/relays.svelte.ts`
- `src/lib/nostr/profile-queries.ts`
- profile / settings / bookmarks route 群

移行先:

```text
src/features/bookmarks/
src/features/follows/
src/features/relays/
src/features/profiles/
```

補足:

- profiles は query と表示モデルを feature 化する
- settings 画面は feature の view model を使うだけにする

### 8.5 sharing / playback / extension bridge

現状の主対象:

- `src/lib/components/ShareButton.svelte`
- 各種 embed component の seek 処理
- `src/lib/stores/player.svelte.ts`
- `src/lib/stores/extension.svelte.ts`

移行先:

```text
src/features/sharing/
src/features/playback/
src/features/extension-bridge/
```

補足:

- `window.dispatchEvent('resonote:seek')` を typed bridge に置き換える
- `window.postMessage` と message schema を 1 か所に集約する

## 9. フェーズ別実行計画

### Phase 0: 実行環境固定

#### 目的

検証不能な状態で構造変更を進めない。

#### やること

- `.nvmrc` または `.node-version` を追加する
- Node 24 と pnpm の組み合わせを固定する
- CI とローカルの Node を一致させる
- `pnpm check` / `pnpm test` のベースラインを記録する
- 既知失敗をドキュメント化する
- coverage 対象設定を `src/features/**` / `src/app/**` まで広げる

#### 成果物

- Node バージョン固定ファイル
- ベースライン結果
- 既知 failure リスト

#### 完了条件

- `pnpm check` と `pnpm test` が Node 24 で再現可能に動く
- 「今回壊した」のか「元から壊れていた」のか区別できる

### Phase 1: 境界の正式導入

#### 目的

新構造を「見た目」ではなく「依存ルール」として機能させる。

#### やること

- `src/shared/` を追加する
- alias を導入する
- ESLint の `no-restricted-imports` で禁止依存を機械化する
- `src/lib` を移行レイヤーと定義する
- shared へ移す候補を最初に切り出す
  - logger
  - emoji utils
  - URL utils
  - Nostr event helper
  - content ID helper

#### 完了条件

- 新規コードが `src/lib/stores` へ増えない
- `features` からの import 先が段階的に `shared` へ寄る
- `src/shared` が空でない

### Phase 2: Comments を縦に完了させる

#### 目的

最大の密結合ポイントを本当に解体する。

#### やること

- `comments.svelte.ts` から subscription, cache restore, reconcile を抜く
- `comment-repository.ts` を作る
- `comment-event-gateway.ts` を作る
- `comment-subscription.ts` を作る
- `comment-view-model.svelte.ts` を作る
- `CommentList.svelte` を presentational 寄りにする
- `CommentForm.svelte` を presentational 寄りにする
- route 側は `createCommentViewModel()` のみ使う
- 旧 `createCommentsStore()` は削除、または wrapper 化

#### テスト

- mapper unit test
- reaction aggregate unit test
- deletion reconcile unit test
- DB restore + live stream integration test
- reply / react / delete action integration test

#### 完了条件

- `src/lib/stores/comments.svelte.ts` が巨大 store ではなくなる
- route が comment の subscribe 詳細を持たない
- UI が comment publish の詳細を持たない

### Phase 3: Content Resolution を完了させる

#### 目的

content page の複雑さを route から除去する。

#### やること

- `resolve-content.ts` を domain/application/infra に分割する
- `podcast-resolver.ts` を feature infra に吸収する
- bookmark cache -> relay -> API の順序を feature 内に閉じ込める
- signed event publish を `resolution-publisher.ts` へ移す
- `PodcastEpisodeList.svelte` から API resolve を抜く
- `PodbeanEmbed.svelte` から `/api/podbean/resolve` 直接呼び出しを抜く
- content page route は `resolved-content-view-model` を使うだけにする

#### テスト

- bookmark hit 時の分岐
- API fallback 時の分岐
- signed publish 発火条件
- resolvedPath 書き換え条件
- metadata merge 優先順位

#### 完了条件

- `src/web/routes/[platform]/[type]/[id]/+page.svelte` の script が画面合成中心になる
- route から `publishSignedEvents` と resolution 詳細が消える

### Phase 4: Session / Auth / Notifications の順序固定

#### 目的

ログイン後に何が起きるかを 1 本の初期化パイプラインにする。

#### やること

- auth state と login gateway を分ける
- `init-app.ts` を追加する
- `init-session.ts` の責務を整理する
- notifications の購読開始を bootstrap へ寄せる
- `+layout.svelte` から通知購読 effect を削除する
- pending publish retry と extension listener の初期化場所を app bootstrap へ移す

#### 期待する順序

1. auth 初期化
2. ログイン検知
3. user relay 適用
4. relay connection refresh
5. follows / bookmarks / mute / emojis load
6. notifications subscribe

#### 完了条件

- login/logout の副作用を 1 ファイルで追える
- `+layout.svelte` が bootstrap の実装を持たない

### Phase 5: Bookmarks / Follows / Relays / Profiles の feature 化

#### 目的

`src/lib/stores` に残っている旧構造を連鎖的に解体する。

#### やること

- bookmarks を feature 化する
- follows を feature 化する
- relays を feature 化する
- profiles query と表示モデルを feature 化する
- settings / bookmarks / profile route を feature facade に差し替える

#### テスト

- bookmark parse / add / remove
- follows restore / refresh / publish
- relay list parse / publish / fallback
- profile comment pagination

#### 完了条件

- `src/lib/stores/bookmarks.svelte.ts`, `follows.svelte.ts`, `relays.svelte.ts` が旧巨大実装でなくなる

### Phase 6: Sharing / Playback / Extension Bridge の整理

#### 目的

UI とブラウザメッセージ境界を整理する。

#### やること

- `ShareButton.svelte` から `castSigned` を抜く
- sharing feature を作る
- playback bridge を作る
- extension message schema を `extension-bridge` に集約する
- embed component は typed player bridge を介して seek / sync する

#### 完了条件

- component から `window.postMessage` と raw custom event が減る
- extension 連携の入口が 1 feature にまとまる

### Phase 7: 周辺 route の整理

#### 対象

- `src/web/routes/[nip19]/+page.svelte`
- profile page
- notifications page
- bookmarks page
- settings page

#### やること

- `[nip19]` の event fetch を feature 化する
- profile page の query を profile feature へ寄せる
- settings ページは feature ごとの view model を使う
- bookmarks / notifications page を UI + facade の構成へそろえる

#### 完了条件

- route script 内の raw Nostr query が消える

### Phase 8: cleanup と最終安定化

#### やること

- 旧 wrapper の削除
- `src/lib` の残骸整理
- import path の正規化
- dead code 削除
- coverage と CI の最終更新
- README / docs 更新

#### 完了条件

- 新旧構造の二重化が解消される
- ディレクトリ構成だけで責務を推測できる

## 10. フェーズの優先順位

優先順位は次に固定します。

1. 実行環境固定
2. 境界の正式導入
3. comments 完了
4. content resolution 完了
5. session / auth / notifications
6. bookmarks / follows / relays / profiles
7. sharing / playback / extension bridge
8. 周辺 route
9. cleanup

理由:

- comments と content resolution が現在の主要な密結合点だから
- session / notifications は順序依存バグを生みやすいから
- bookmarks / follows / relays は他 feature の前提データだから

## 11. テスト戦略

### 11.1 unit test を増やす場所

- comment mapper
- deletion rule
- reaction aggregate
- notification classify
- bookmark tag parse
- relay tag parse
- resolution fallback rule
- content link / URL normalize

### 11.2 integration test を増やす場所

- comment restore + subscribe
- auth login -> session init
- follows load -> notifications subscribe
- audio resolve fallback
- bookmark add/remove publish

### 11.3 E2E 最低ライン

- ログインできる
- コンテンツページを開ける
- コメント一覧が表示される
- コメント投稿できる
- bookmark を追加・削除できる
- notifications が開ける
- settings の relay 編集が開ける

## 12. レビュー観点

レビュー時は、次を必ず確認します。

- 責務が減ったか
- route が軽くなったか
- layout が軽くなったか
- UI が infra を直接触っていないか
- feature が shared 以外に依存していないか
- 一時 wrapper に削除期限があるか
- テストの粒度が適切か
- 新しい abstraction が単なる名付け替えで終わっていないか

## 13. リスクと対策

### リスク1: `features/` を作っても依存が逆流する

対策:

- alias 導入
- lint で禁止 import を固定
- `src/lib` を移行レイヤーと明文化

### リスク2: 購読順序の差で挙動が壊れる

対策:

- bootstrap 順序を文書化
- integration test 追加
- timeout ベース処理を feature 側へ集約

### リスク3: wrapper が永続化する

対策:

- phase ごとに旧コード削除を完了条件に入れる
- wrapper に削除予定 phase を記載する

### リスク4: content resolution の fallback が壊れる

対策:

- result 型を先に固定
- bookmark hit / API fallback / publish 条件をテスト化

### リスク5: dirty worktree と競合する

対策:

- phase をまたぐ大規模編集を避ける
- 1 feature 単位で完結させる
- unrelated file を巻き込まない

## 14. コミット方針

1 コミット 1 意味を守ります。

推奨例:

1. Node / pnpm 固定
2. alias / shared 導入
3. comments infra 分離
4. comments view model 導入
5. comments route 差し替え
6. content-resolution infra 分離
7. content page route 差し替え
8. session bootstrap 整理
9. notifications feature 化
10. bookmarks / follows / relays feature 化
11. sharing / extension bridge 整理
12. cleanup

悪い例:

- comments 分離
- settings UI 修正
- CSS 調整
- bookmark バグ修正

を同一コミットに混ぜること。

## 15. 直近 2 週間の実行順

### Week 1

- Day 1: Node / pnpm 固定、baseline 記録
- Day 2: alias と `src/shared` 導入、lint ルール追加
- Day 3: comments repository / gateway / subscription 分離
- Day 4: comments view model 導入
- Day 5: content page route を comment facade ベースへ差し替え

### Week 2

- Day 6: content-resolution infra 分離
- Day 7: `+page.svelte` から publish / rewrite / subscribe 追加を抜く
- Day 8: bootstrap と notifications 開始順序の整理
- Day 9: layout の副作用削減
- Day 10: bookmarks / follows / relays の次着手点を確定し、旧 wrapper を整理

## 16. 今この瞬間の最優先タスク

迷ったら、次の順序だけ守ればよいです。

1. Node / pnpm の実行環境を固定する
2. `src/shared` と alias を導入する
3. `src/lib/stores/comments.svelte.ts` を解体する
4. `src/web/routes/[platform]/[type]/[id]/+page.svelte` を composition root にする
5. `src/web/routes/+layout.svelte` から通知購読副作用を抜く

## 17. Definition of Done

全面リファクタリング完了の定義を最後に再掲します。

- `comments` の実体が旧 store に残っていない
- content resolution の実体が route と component に残っていない
- auth 後初期化順序を 1 か所で追える
- `bookmarks` / `follows` / `notifications` / `relays` / `extension` が feature 単位で整理されている
- UI から infra 直接依存が消えている
- `src/lib` が巨大業務ロジック置き場でなくなっている
- Node 24 環境で `pnpm check` / `pnpm test` / 必要な smoke E2E が通る
- README または docs に新構造を説明できる

以上を満たした時点を、Resonote の全面リファクタリング完了と定義します。
