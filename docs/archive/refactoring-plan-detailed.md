# Resonote 完全リファクタリング詳細計画書

最終更新: 2026-03-20
対象リポジトリ: `Resonote`
目的: 現在のコードベースを段階的に完全整理し、責務境界が逆流しない構造へ到達するための実行基準を定義する

## 1. この文書の位置づけ

この文書は、既存の `docs/refactoring-plan.md` を前提に、2026-03-20 時点の実装状態を踏まえて再整理した実行計画です。

この文書で決めること:

- 何をもって「完全リファクタリング完了」とみなすか
- 次に何を優先し、何を後ろに回すか
- どの層に何を書いてよいか
- 移行中に許容する暫定構成と許容しない逆流
- 各フェーズの完了条件
- レビュー時に確認すべき観点

この文書は希望や理想論ではなく、実際の実装・レビュー・コミットを進めるための作業基準です。

## 2. 現状の総括

進んでいる点と、まだ未完了な点がはっきり分かれています。

### 2.1 進んでいる点

- `src/shared/` が導入され、共通ユーティリティと型の移行先ができている
- alias が導入されている
  - `$appcore`
  - `$features`
  - `$shared`
  - `$extension`
- `comments` は `domain / application / infra / ui` への分離が最も進んでいる
- `src/lib/stores/comments.svelte.ts` は巨大 store ではなく互換 facade に縮小されている
- `src/app/bootstrap/` が導入され、初期化の集約ポイントが作られている
- coverage 設定は `src/features/**` と `src/app/**` を対象に含むようになっている

### 2.2 未完了の点

ただし、構造はまだ「新住所を作った段階」で止まっています。

#### 未完了1: content page route が依然として重い

`src/web/routes/[platform]/[type]/[id]/+page.svelte` はまだ次を持っています。

- bookmark toggle
- player 初期 seek
- comments view model の生成と破棄
- content resolution の呼び分け
- additional subscription の適用
- resolvedPath の URL rewrite
- extension open action

つまり route がまだ composition root に留まっていません。

#### 未完了2: `+layout.svelte` がまだ bootstrap trigger を持っている

`src/web/routes/+layout.svelte` は UI shell になりつつありますが、通知購読開始の reactive trigger はまだ route 側に残っています。

#### 未完了3: `app` と `features` がまだ `$lib` を直接使っている

代表例:

- `src/app/bootstrap/init-app.ts`
- `src/app/bootstrap/init-session.ts`
- `src/features/comments/application/comment-actions.ts`
- `src/features/comments/application/comment-subscription.ts`
- `src/features/content-resolution/application/resolve-content.ts`
- `src/features/sharing/application/share-actions.ts`
- `src/features/profiles/application/profile-queries.ts`

今の `features` は「別ディレクトリ」にはなっていますが、依存境界としてはまだ不完全です。

#### 未完了4: 旧 store 群に実体が残っている

次のファイルには state, query, publish, subscription, cache restore が依然として混在しています。

- `src/lib/stores/bookmarks.svelte.ts`
- `src/lib/stores/follows.svelte.ts`
- `src/lib/stores/notifications.svelte.ts`
- `src/lib/stores/relays.svelte.ts`
- `src/lib/stores/extension.svelte.ts`

comments と同じ整理が他 feature に波及していません。

#### 未完了5: UI がまだ多責務

特に次が重いです。

- `src/lib/components/CommentList.svelte`
- 各種 embed component
- profile / notifications / settings の route 群

UI 分割は進んでいますが、presentational と view model の境界はまだ曖昧です。

#### 未完了6: 実行環境固定が終わっていない

- `package.json` は Node `>=24.0.0` を要求している
- `.node-version` は追加済み
- `node -v` と `pnpm exec node -v` は Node 24 を指している
- しかし `pnpm check` は Node `v20.11.1` を見て失敗する

この状態では構造変更の回帰確認が不安定です。

#### 未完了7: lint による境界強制が足りない

`eslint.config.js` の `no-restricted-imports` は現状 `domain` のみ対象です。
これでは `application` / `ui` / `app` / `route` 側で依存が再び逆流します。

## 3. 完全リファクタリング完了の定義

完了条件は次です。

- route と layout が画面合成と最小限の起動タイミング制御だけを持つ
- `comments` が feature として縦に完了している
- content resolution が route と component から分離されている
- login/logout 後の副作用順序を `app/bootstrap` で追える
- `bookmarks` / `follows` / `notifications` / `relays` / `profiles` が feature 単位で整理されている
- UI component から `castSigned`, `getRxNostr`, `getEventsDB`, raw `fetch('/api/...')`, raw browser messaging が消えている
- `src/lib/stores` が業務ロジック本体ではなく wrapper / app shell state 中心になる
- lint で禁止依存が機械的に止められる
- Node 24 環境で `pnpm check`, `pnpm test`, 必要な E2E smoke が再現可能に動く

## 4. 最終アーキテクチャ方針

### 4.1 依存方向

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
  -> features
  -> shared
```

禁止する依存:

- `shared -> features`
- `feature A -> feature B の ui/infra`
- `ui -> infra`
- `route/layout -> rx-nostr / IndexedDB / raw fetch / raw browser messaging`
- `app -> src/lib/stores` の恒久依存

### 4.2 層の意味

#### `domain`

- 純粋関数
- 型
- 判定ルール
- 集計
- 変換

禁止:

- `fetch`
- `IndexedDB`
- `window`
- `document`
- `rx-nostr`

#### `application`

- ユースケース
- 処理順序
- 複数 domain / infra のオーケストレーション
- cancellation
- retry

#### `infra`

- Nostr gateway
- IndexedDB repository
- API client
- browser messaging
- clipboard
- persistence

#### `ui`

- component
- view model
- local UI state
- callback wiring

## 5. 新規実装ルール

### 5.1 新規実装禁止ゾーン

今後、新しい業務ロジックを追加してはいけない場所:

- `src/lib/stores/comments.svelte.ts`
- `src/lib/stores/bookmarks.svelte.ts`
- `src/lib/stores/follows.svelte.ts`
- `src/lib/stores/notifications.svelte.ts`
- `src/lib/stores/relays.svelte.ts`
- `src/lib/stores/extension.svelte.ts`
- `src/web/routes/[platform]/[type]/[id]/+page.svelte`
- `src/web/routes/+layout.svelte`

### 5.2 `src/lib` の扱い

- `src/lib` は即削除しない
- ただし新規の業務ロジック実装先にしない
- 実体移行後は wrapper か re-export だけ残す
- wrapper には削除予定フェーズをコメントで残す

### 5.3 route / layout の責務

route と layout がやってよいこと:

- route param の受け取り
- feature facade / view model の起動
- props の受け渡し
- 画面の組み立て

route と layout がやってはいけないこと:

- `getRxNostr`
- `castSigned`
- `getEventsDB`
- raw `fetch('/api/...')`
- subscription 詳細
- fallback resolution 手順
- timeout ベース副作用の調停

## 6. 優先順位

優先順位は次に固定します。

1. 実行環境固定
2. 境界強制の機械化
3. content page と comments の同時完了
4. content resolution 完了
5. session / auth / notifications
6. bookmarks / follows / relays / profiles
7. sharing / playback / extension bridge
8. 周辺 route の整理
9. cleanup

### 6.1 この順序にする理由

- 一番大きい密結合点は content page route だから
- comments は store 側より route 側が現在のボトルネックだから
- session / notifications は順序依存バグを生みやすいから
- bookmarks / follows / relays は他 feature の基盤データだから
- playback / extension は横断影響が大きく、前半で設計出口だけ固定して後半で詰めるのが安全だから

## 7. フェーズ別実行計画

## Phase 0: 実行環境固定

### 目的

検証不能な状態で構造変更を進めない。

### やること

- Node 24 の使用経路を `pnpm` まで含めて一致させる
- `.node-version` を CI / ローカルの基準として明文化する
- `pnpm check` が Node 24 を見るように修正する
- `pnpm test` のベースラインを確認する
- 既知 failure を文書化する

### 完了条件

- `node -v`
- `pnpm exec node -v`
- `pnpm check`
- `pnpm test`

上記が同じ Node 24 系で再現可能に動く。

## Phase 1: 境界強制の機械化

### 目的

新構造を命名ではなくルールとして機能させる。

### やること

- alias 運用を正式化する
- `eslint` に `no-restricted-imports` を追加する
- 対象を `domain` だけでなく `application`, `ui`, `app`, `web/routes` まで広げる
- 禁止ルールを少なくとも次にかける
  - `features/** -> $lib/nostr/*`
  - `features/** -> $lib/stores/*`
  - `app/** -> $lib/stores/*` の恒久依存
  - `web/routes/** -> rx-nostr`, `event-db`, `publish-signed`
  - `ui -> raw browser message API`

### 完了条件

- 新規コードが `src/lib/stores` に戻らない
- route/layout から infra 直叩きが lint で止まる
- feature が shared 以外へ逆流したときに CI で落ちる

## Phase 2: Content Page と Comments の同時完了

### 目的

最も重い route を composition root に戻し、comments を本当に縦完了させる。

### やること

- content page route から bookmark toggle を抜く
- content page route から player 初期 seek を抜く
- content page route から resolution 適用と URL rewrite を抜く
- content page route から additional subscription 適用を抜く
- route は `comment-view-model` と `resolved-content-view-model` を使うだけにする
- `CommentList.svelte` を分解する
  - filter state
  - reply state
  - player sync
  - profile preload
  - mute integration
- `CommentForm.svelte` も view model を介す構成に寄せる

### 補足

`comments` は store 分離自体はかなり進んでいるため、次の本丸は route と UI の責務削減です。

### 完了条件

- `src/web/routes/[platform]/[type]/[id]/+page.svelte` が画面合成中心になる
- route から comment の subscribe / resolution details が消える
- `CommentList` が多責務 UI でなくなる

## Phase 3: Content Resolution の完了

### 目的

content resolution を feature 内に閉じ込める。

### やること

- `resolve-content.ts` から `$lib/content/*` 依存を外す
- `podcast-resolver.ts` を feature infra に吸収する
- API client, bookmark search, signed publish を infra に分離する
- `resolvePodcastFeed` も同じ規約に揃える
- `PodbeanEmbed.svelte` と `PodcastEpisodeList.svelte` から resolution 詳細を抜く
- `resolved-content-view-model.svelte.ts` を作る

### 完了条件

- route が resolution の fallback 順序を知らない
- component が API resolve 手順を知らない
- feature の application が `$lib` 依存から抜ける

## Phase 4: Session / Auth / Notifications の順序固定

### 目的

ログイン後に何が起きるかを `app/bootstrap` から一貫して追えるようにする。

### やること

- `init-app.ts` から `$lib` 直 import を段階的に除去する
- `auth` の state と login gateway を分ける
- `notifications` を feature 化する
- 通知購読開始の trigger を layout から app 側へ寄せる
- `init-session.ts` のロード順を feature facade 経由にする
- pending publish retry と extension listener 初期化も app facade 化する

### 期待する順序

1. auth 初期化
2. login 検知
3. user relay 適用
4. relay connection refresh
5. follows / bookmarks / mute / emojis load
6. notifications subscribe

### 完了条件

- login/logout の副作用順序を 1 箇所で追える
- `+layout.svelte` から bootstrap 実装がほぼ消える

## Phase 5: Bookmarks / Follows / Relays / Profiles の feature 化

### 目的

旧巨大 store 群を連鎖的に解体する。

### やること

- bookmarks を `domain / application / infra / ui` へ分離する
- follows を `domain / application / infra / ui` へ分離する
- relays を `domain / application / infra / ui` へ分離する
- profiles query と view model を feature に寄せる
- bookmarks / settings / profile route を feature facade 利用へ差し替える

### 優先メモ

`profile` は route 分割済みなので、先に query と action だけ feature 化しやすい。

### 完了条件

- `src/lib/stores/bookmarks.svelte.ts` が wrapper 化される
- `src/lib/stores/follows.svelte.ts` が wrapper 化される
- `src/lib/stores/relays.svelte.ts` が wrapper 化される
- profile route が `$lib/nostr/*` を直接触らない

## Phase 6: Sharing / Playback / Extension Bridge

### 目的

UI とブラウザメッセージ境界を整理する。

### やること

- `sharing` から `$lib/nostr/client` 依存を外す
- publish gateway を feature infra に移す
- `window.dispatchEvent('resonote:seek')` を typed playback bridge に置き換える
- embed component の seek/sync を bridge 経由にする
- extension message schema を `extension-bridge` に集約する
- `src/lib/stores/extension.svelte.ts` を wrapper か facade に縮小する

### 完了条件

- component から raw custom event が減る
- component から raw `window.postMessage` が消える
- playback と extension が 1 箇所で理解できる

## Phase 7: 周辺 Route の整理

### 対象

- `[nip19]`
- profile
- notifications
- bookmarks
- settings

### やること

- `[nip19]` の event fetch を feature facade に寄せる
- notifications page の profile preload / target fetch を view model 化する
- settings page の通知 filter / relay 設定を feature ごとに分離する
- bookmarks page を feature UI と facade だけで構成する

### 完了条件

- route script から raw query が消える
- route ごとに feature facade だけ見れば動きが分かる

## Phase 8: Cleanup と最終安定化

### やること

- wrapper の削除
- `src/lib` の残骸整理
- import path 正規化
- dead code 削除
- CI / coverage / docs 更新
- E2E smoke 整備

### 完了条件

- 新旧構造の二重化が最小になる
- ディレクトリ構成だけで責務を推測できる

## 8. 各フェーズの成果物

各フェーズで必ず残す成果物:

- 実装コード
- テスト
- wrapper 削除方針コメント
- 既知制約メモ
- 必要なら docs 更新

## 9. テスト戦略

### 9.1 unit test

増やすべき対象:

- comment mapper
- deletion rule
- reaction aggregate
- notification classify
- bookmark tag parse
- relay tag parse
- resolution fallback rule
- content link / URL normalize

### 9.2 integration test

増やすべき対象:

- comment restore + live subscribe
- auth login -> session init
- follows load -> notifications subscribe
- audio resolve fallback
- bookmark add/remove publish
- relay list publish / refresh

### 9.3 E2E 最低ライン

- ログインできる
- content page を開ける
- comments が表示される
- comment 投稿できる
- bookmark を追加・削除できる
- notifications が開ける
- settings の relay 編集が開ける

## 10. lint / review 観点

レビュー時に必ず確認する項目:

- route が軽くなったか
- layout が軽くなったか
- UI が infra を直接触っていないか
- feature が shared 以外へ逆流していないか
- wrapper に削除予定フェーズがあるか
- abstraction が単なる名前変更で終わっていないか
- 変更単位がテスト可能か

## 11. コミット方針

1 コミット 1 意味を守る。

推奨順:

1. Node / pnpm 実行環境固定
2. lint による境界強制
3. content page route 縮小
4. comments UI / view model 分離
5. content-resolution infra 分離
6. session / notifications 再編
7. bookmarks feature 化
8. follows feature 化
9. relays / profiles feature 化
10. sharing / playback / extension bridge 整理
11. 周辺 route 差し替え
12. cleanup

避けるべきコミット:

- route 縮小と unrelated UI 変更の混在
- 複数 feature の大移植を 1 コミットに詰め込むこと
- wrapper 追加だけして削除フェーズを書かないこと

## 12. 直近の次アクション

今すぐ着手すべき順番は次です。

1. `pnpm check` が Node 24 を見るように環境を固定する
2. lint で `route/layout -> infra`, `features -> $lib stores/nostr`, `ui -> raw browser messaging` を禁止する
3. content page route を `comment-view-model` と `resolved-content-view-model` 利用だけに縮める
4. `CommentList` を分割し、filter/player/reply/mute/profile preload を view model へ寄せる
5. その後に bookmarks / follows / notifications / relays を同じパターンで feature 化する

## 13. 最終判断

このリファクタリングの主戦場は `src/lib` から `src/features` への引っ越しそのものではありません。
本質は、次の 3 点を最後まで貫くことです。

- route/layout を composition root に戻す
- feature の外へ infra 依存を漏らさない
- 旧 store を wrapper に縮小し、本体の座を降ろす

この 3 点を満たした時点で、全面リファクタリングは完了とみなします。
