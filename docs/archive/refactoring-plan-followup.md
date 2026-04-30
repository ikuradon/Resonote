# Resonote 完全リファクタリング追補計画書

最終更新: 2026-03-20
対象リポジトリ: `Resonote`
前提文書:

- `docs/refactoring-plan.md`
- `docs/refactoring-plan-detailed.md`

## 1. この文書の目的

この文書は、前回の詳細計画に沿って進めたリファクタリングの実装状況を確認したうえで、次に何を優先して進めるべきかを再定義する追補計画です。

前回計画の主眼は「route を軽くし、feature の骨組みを作る」ことでした。
今回の結論は、その段階は一定前進した一方で、次の主戦場は「`$lib` に残る infra 本体を feature / shared へ引き上げること」に移った、です。

## 2. 前回計画から進んだこと

### 2.1 content page route はかなり軽くなった

`src/web/routes/[platform]/[type]/[id]/+page.svelte` は、前回時点より明確に軽くなっています。

- resolution, bookmark toggle, comment store lifecycle を `createResolvedContentViewModel()` に寄せた
- route script は route param の受け渡しと UI 合成が中心になった
- content page の責務縮小は明確に前進した

これは前回計画の大きな達成点です。

### 2.2 bookmarks / follows / relays は write-side の feature 化が始まった

次の進展があります。

- `features/bookmarks/application/bookmark-actions.ts`
- `features/follows/application/follow-actions.ts`
- `features/relays/application/relay-actions.ts`
- `features/mute/application/mute-actions.ts`

旧 store から publish の詳細を剥がし始めており、これは正しい方向です。

### 2.3 lint は一歩前進した

`eslint.config.js` には、前回より広い禁止 import ルールが入りました。

- `domain` の禁止 import
- route/layout に対する直接 infra access の警告
- UI component に対する直接 infra access の警告

まだ不十分ですが、境界を機械化する方向には進んでいます。

## 3. 再診断

現状のボトルネックは、前回から変わっています。

### 3.1 もう route 単体が最大問題ではない

content page route の肥大化は緩和されました。
しかし、その責務の一部は `features/content-resolution/ui/resolved-content-view-model.svelte.ts` に移っただけで、完全分離には至っていません。

特にこの view model はまだ次を抱えています。

- bookmark toggle
- player reset / initial seek
- comment view model lifecycle
- resolution result の適用
- URL rewrite

つまり「route から feature/ui への横滑り」であり、設計としては暫定地点です。

### 3.2 feature の `application` / `ui` がまだ `$lib` に依存している

次の依存がまだ残っています。

- `features/comments/application/* -> $lib/nostr/client`
- `features/bookmarks/application/* -> $lib/nostr/client`
- `features/follows/application/* -> $lib/nostr/client`
- `features/relays/application/* -> $lib/nostr/client`
- `features/sharing/application/* -> $lib/nostr/client`
- `features/content-resolution/application/* -> $lib/content/*`, `$lib/nostr/publish-signed`
- `features/content-resolution/ui/* -> $lib/stores/bookmarks`, `$lib/stores/player`

この状態では feature が依存境界になりません。

### 3.3 read-side の実体は依然として旧 store に残っている

bookmarks は wrapper 化が進みましたが、read-side 全体では次がまだ旧構造です。

- `src/lib/stores/follows.svelte.ts`
- `src/lib/stores/notifications.svelte.ts`
- `src/lib/stores/relays.svelte.ts`
- `src/lib/stores/profile.svelte.ts`
- `src/lib/stores/emoji-sets.svelte.ts`

共通点は、state と query と relay-session / IndexedDB がまだ 1 ファイルに混ざっていることです。

### 3.4 bootstrap は依然として `$lib` facade 集約のまま

`src/app/bootstrap/init-app.ts`
`src/app/bootstrap/init-session.ts`
`src/app/bootstrap/init-notifications.svelte.ts`

これらは app 層の名前になっていますが、実体はまだ `$lib/stores/*` と `$lib/nostr/*` の組み合わせです。
したがって、login/logout 順序は見えるようになったが、依存方向はまだ改善途中です。

### 3.5 notifications feature 化は未着手に近い

`features/notifications/application/notification-subscription.ts` は実質的に re-export のみで、実体はまだ `src/lib/stores/notifications.svelte.ts` にあります。

このため:

- 購読開始ロジック
- mute/filter 適用
- unread 状態
- follow-comment 制限

が依然として旧 store に残っています。

### 3.6 profile / notifications route は依然として旧構造直結

次の route はまだ feature facade よりも旧 store / old query に依存しています。

- `src/web/routes/profile/[id]/+page.svelte`
- `src/web/routes/notifications/+page.svelte`
- `src/web/routes/bookmarks/+page.svelte`

特に profile と notifications は、次フェーズでの主要対象です。

### 3.7 browser bridge 問題は未着手

raw browser event/message がまだ多く残っています。

- `window.dispatchEvent('resonote:seek')`
- `window.addEventListener('resonote:seek', ...)`
- `window.addEventListener('message', ...)`
- `window.parent.postMessage(...)`

playback と extension の境界はまだ feature として成立していません。

### 3.8 実行環境固定は未解決

依然として:

- `node -v` は Node 24
- しかし `pnpm check` は Node 20 を見て失敗

この問題は前回から継続しており、Phase 0 はまだ未完了です。

## 4. 今回の結論

次の完全リファクタリング方針は、以下の 6 点です。

1. まず実行環境固定を終わらせる
2. `shared` に infra gateway を作り、feature の `$lib` 依存を止める
3. write-side だけでなく read-side も feature 化する
4. `feature/ui` に横滑りした責務をさらに分割する
5. `notifications` / `profiles` を次の主戦場にする
6. `playback` / `extension-bridge` を browser transport の唯一入口にする

重要なのは、これ以上「route から feature/ui へ移すだけ」の移植を続けないことです。
次の段階では、依存方向そのものを変えなければ意味がありません。

## 5. 次フェーズの最終目標

次の追補フェーズで達成すべき状態は次です。

- `features/**/application` が `$lib/nostr/*` を直接 import しない
- `features/**/ui` が `$lib/stores/*` を直接 import しない
- `app/bootstrap` が `$lib/stores/*` の実体に依存しない
- `notifications` の実体が feature 側へ移る
- `profiles` の query / pagination / action が feature 側へ移る
- playback と extension の transport が typed bridge に集約される
- lint が warning ではなく error として機能する

## 6. 更新後の優先順位

優先順位は次に更新します。

1. 実行環境固定
2. infra gateway 導入
3. bootstrap の依存反転
4. notifications / profiles の feature 実体化
5. follows / relays の read-side feature 化
6. playback / extension bridge の整理
7. bookmarks / settings / notifications / profile route の最終整理
8. comments UI の二次分割
9. cleanup

### この順序にする理由

- もう content route 自体は最大の密結合点ではない
- 次に詰まっているのは `$lib` infra 依存と read-side の旧 store だから
- notifications と profiles は route 側の複雑さと依存逆流の両方を抱えているから
- playback / extension は横断影響が大きく、早めに出口だけ定義しておく価値が高いから

## 7. 実行計画

## Phase A: 実行環境固定の完了

### 目的

回帰確認可能な状態を作る。

### やること

- `pnpm check` が Node 24 を見るように修正する
- `pnpm test` のベースラインを記録する
- CI とローカルの Node / pnpm の解決経路を一致させる

### 完了条件

- `node -v`
- `pnpm exec node -v`
- `pnpm check`
- `pnpm test`

が同じ Node 24 系で整合する。

## Phase B: shared infra gateway 導入

### 目的

feature が `$lib` infra に直接ぶら下がる構造を止める。

### やること

- `src/shared/nostr/` に gateway を作る
  - publish gateway
  - latest-event query gateway
  - relay-session gateway
  - events DB gateway
- `src/shared/content/` に resolution 用 gateway / helper を寄せる
- `src/shared/browser/` を追加する
  - player seek bridge
  - extension message bridge

### 原則

- feature application は `$shared` の gateway interface だけを見る
- `$lib/nostr/client.ts` や `$lib/nostr/event-db.ts` は gateway 実装の背後へ下げる

### 完了条件

- `features/**/application` に `$lib/nostr/*` import が残らない
- `features/comments/infra/comment-repository.ts` も `$shared` gateway に寄る

## Phase C: bootstrap の依存反転

### 目的

`app/bootstrap` を本当の composition layer にする。

### やること

- `init-app.ts` が feature facade を呼ぶようにする
- `init-session.ts` が feature state / feature action を呼ぶようにする
- `init-notifications.svelte.ts` が notification feature facade を使うようにする
- layout 側は bootstrap trigger をさらに減らす

### 完了条件

- `src/app/bootstrap/*` に `$lib/stores/*` 依存が残らない
- login/logout 後の副作用順序を app 側だけで追える

## Phase D: notifications / profiles を feature の実体へする

### 目的

次の大きな read-side 密結合点を解体する。

### やること

- `features/notifications/application/notification-subscription.ts` を実体化する
- `features/notifications/ui/notifications-view-model.svelte.ts` を追加する
- `features/profiles/application/profile-queries.ts` を infra gateway ベースへ切り替える
- `features/profiles/ui/profile-view-model.svelte.ts` を追加する
- profile route と notifications route を feature facade 利用に差し替える

### 補足

この段階で route は:

- pubkey 解決
- view model 呼び出し
- props 渡し

だけを持つ構成へ寄せる。

### 完了条件

- `src/web/routes/profile/[id]/+page.svelte` が `$lib/nostr/*` を直接触らない
- `src/web/routes/notifications/+page.svelte` が preload / fetch / mark-read の実装詳細を持たない
- notification の購読本体が旧 store から抜ける

## Phase E: follows / relays の read-side feature 化

### 目的

書き込みだけ feature 化された状態を終わらせる。

### やること

- follows の restore / refresh / WoT load を feature へ移す
- relays の fetch / status / fallback を feature へ移す
- store は wrapper か state facade に縮小する
- settings の relay UI は feature view model を使うだけにする

### 完了条件

- `src/lib/stores/follows.svelte.ts` から relay-session / event-db 依存が抜ける
- `src/lib/stores/relays.svelte.ts` から relay-session 依存が抜ける

## Phase F: playback / extension-bridge の整理

### 目的

raw browser transport を閉じ込める。

### やること

- `window.dispatchEvent('resonote:seek')` を typed player bridge に置換する
- 各 embed component は bridge 経由で seek を受ける
- extension listener と postMessage schema を feature 側へ集約する
- `src/lib/stores/extension.svelte.ts` は wrapper へ縮小する

### 完了条件

- component から raw `window.addEventListener('resonote:seek')` が消える
- component から raw `postMessage` が消える

## Phase G: route 整理の最終化

### 対象

- bookmarks
- profile
- notifications
- settings
- `[nip19]`

### やること

- bookmarks page を bookmarks feature facade のみで駆動する
- settings を feature ごとの state に寄せる
- `[nip19]` の fetch / relay hint merge を feature 側で閉じる

### 完了条件

- route script が orchestration 実装を持たない

## Phase H: cleanup

### やること

- wrapper 削除
- warning を error へ格上げ
- dead code 削除
- import path 正規化
- docs / README 更新

### 完了条件

- `src/lib` が移行レイヤーまたは shared UI 程度に縮小される
- lint が境界違反を必ず止める

## 8. 今回強く禁止すること

次フェーズでは、次を避ける。

- route から logic を feature/ui に移しただけで完了とみなすこと
- `$lib` import を残したまま feature 化完了扱いにすること
- write-side だけ移して read-side を旧 store に残すこと
- warning の lint を放置して設計完了とみなすこと
- browser event / message を component ごとに増やすこと

## 9. テスト方針の更新

次フェーズでは unit test より integration test の比重を上げる。

優先対象:

- gateway 経由の publish / query
- login -> session init -> notifications subscribe
- follows restore / refresh
- relay status / relay publish
- profile pagination
- player bridge / extension bridge

E2E 最低ライン:

- content page を開ける
- comment できる
- bookmark を追加 / 削除できる
- profile を開ける
- notifications を開ける
- relay 設定を更新できる

## 10. 直近の次アクション

今すぐ着手すべき順番は次です。

1. `pnpm check` の Node 24 問題を解決する
2. `shared/nostr` と `shared/browser` に gateway / bridge を追加する
3. `features/comments`, `features/bookmarks`, `features/follows`, `features/relays`, `features/sharing` の `$lib` import を gateway 経由に置き換える
4. `notifications` と `profiles` の view model を作り、route を差し替える
5. その後に `playback` / `extension-bridge` を整理する

## 11. 最終判断

前回計画で達成したのは「新構造へ入る入口を作った」段階です。
今回の追補フェーズでやるべきことは、「その入口の奥にまだ残っている旧 infra 本体を引き上げること」です。

したがって、これからの完全リファクタリングの成否は次で決まります。

- feature が本当に独立した境界になるか
- read-side の実体を旧 store から抜けるか
- browser transport を 1 箇所へ閉じ込められるか
- app/bootstrap が本当に composition layer になるか

この 4 点が揃った時点で、全面リファクタリングは終盤に入ったと判断してよいです。
