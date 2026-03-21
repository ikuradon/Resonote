# Resonote 完全リファクタリング境界強化計画書

最終更新: 2026-03-20
対象リポジトリ: `Resonote`
前提文書:

- `docs/refactoring-plan.md`
- `docs/refactoring-plan-detailed.md`
- `docs/refactoring-plan-followup.md`
- `docs/refactoring-plan-next-stage.md`

## 1. この文書の目的

この文書は、前回の次段計画後に進んだ実装を確認したうえで、残りの完全リファクタリングをどう完了させるかを再定義する計画です。

今回の結論は明確です。

- 骨組みの導入フェーズはかなり進んだ
- しかし本体の責務移譲はまだ中途半端な箇所が残る
- したがって、次にやるべきことは新しい層を増やすことではなく、既に導入した境界を硬くすること

この文書では、そのための優先順位と完了条件を定義します。

## 2. 今回確認できた進捗

### 2.1 `app/bootstrap` の依存方向は前進した

`src/app/bootstrap/init-app.ts`
`src/app/bootstrap/init-session.ts`
`src/app/bootstrap/init-notifications.svelte.ts`

は、前回より `$shared` 経由へ寄っています。
app 層が `$lib` 実装直結から離れ始めた点は大きな前進です。

### 2.2 `shared/nostr` と `shared/browser` の入口は定着した

次の入口は既に存在し、利用も始まっています。

- `src/shared/nostr/gateway.ts`
- `src/shared/nostr/relays-config.ts`
- `src/shared/browser/auth.ts`
- `src/shared/browser/bookmarks.ts`
- `src/shared/browser/notifications.ts`
- `src/shared/browser/player.ts`
- `src/shared/browser/extension.ts`
- `src/shared/browser/seek-bridge.ts`
- `src/shared/browser/stores.ts`

これは「依存先の整理先」が確立したことを意味します。

### 2.3 feature からの `$lib` 直接依存はさらに減った

前回よりかなり減っています。
特に次は前進です。

- comments action は `$shared/nostr/gateway` を使う
- content-resolution view model は `$shared/browser/*` を使う
- follows の WoT fetch は `features/follows/infra/wot-fetcher.ts` へ移り始めた
- profiles には `profile-actions.ts` が追加され、follow count query の一部が feature 化された

### 2.4 seek transport はほぼ集約できた

`src/shared/browser/seek-bridge.ts` が入り、seek custom event は一応 1 箇所へまとまりました。
まだ完全ではありませんが、playback 整理は前回より進んでいます。

### 2.5 lint は route/UI 側で強化された

`eslint.config.js` は route/layout と UI component の infra 直結を `error` にしています。
規約は前回より強くなりました。

## 3. 現在の本当のボトルネック

ここから先は、前回までと同じ問題を追う必要はありません。
今のボトルネックは、次の 6 点に絞れます。

### 3.1 実行環境固定は依然として未解決

今回も次の状態です。

- `node -v` は `v24.14.0`
- `pnpm exec node -v` も `v24.14.0`
- しかし `pnpm check` は Node `v20.11.1` を見て失敗

この問題が残る限り、構造変更の正否が不安定です。

### 3.2 feature の最後の `$lib` 直依存が残っている

今回確認した時点で、主な残りは次です。

- `features/bookmarks/application/bookmark-actions.ts`
- `features/follows/application/follow-actions.ts`
- `features/relays/application/relay-actions.ts`
- `features/mute/application/mute-actions.ts`
- `features/comments/application/comment-subscription.ts`
- `features/comments/infra/comment-repository.ts`
- `features/profiles/application/profile-queries.ts`
- `features/nip19-resolver/application/fetch-event.ts`

つまり「かなり減ったが、最後の直結がまだ残っている」状態です。

### 3.3 `shared` gateway / bridge の多くがまだ pass-through

`shared/nostr/gateway.ts` と `shared/browser/*.ts` の多くは、現状ではまだ実装の中継です。

この状態の問題:

- 実装本体は依然として `src/lib` にある
- 境界として存在しても、責務分離としては弱い
- import path は変わっても ownership は変わらない

したがって次段階では、「shared にある」ことだけでは完了とみなさない必要があります。

### 3.4 notifications はまだ feature 未完了

`features/notifications/application/notification-subscription.ts` は依然として実体を持っていません。
一方で次はまだ `src/lib/stores/notifications.svelte.ts` にあります。

- 購読開始
- unread 管理
- localStorage 管理
- filter
- mute 適用
- follow-comment 制限

notifications は、いまも最大の未完 feature です。

### 3.5 profiles / settings / notifications / bookmarks route が旧構造寄り

特に未完了なのは次です。

- `src/web/routes/profile/[id]/+page.svelte`
- `src/web/routes/notifications/+page.svelte`
- `src/web/routes/settings/RelaySettings.svelte`
- `src/web/routes/bookmarks/+page.svelte`

profile は count query の一部だけ feature 化されましたが、本体はまだ route 主導です。
notifications は route が read-model を抱えたままです。
settings は relay 管理が旧 store と cached query に直結しています。
bookmarks も page 側で旧 store facade を直接使っています。

### 3.6 lint の盲点がまだある

いまの lint は次を止めます。

- route/layout -> infra 直アクセス
- UI component -> infra 直アクセス

しかし次はまだ十分に止めていません。

- feature -> `$lib/stores/*`
- feature -> `$lib/nostr/*`
- route -> `$lib/stores/*`
- settings / profile / notifications route の旧 store 依存

つまり、境界強制はまだ途中です。

## 4. 今回の結論

次の完全リファクタリング方針は、以下の 5 点です。

1. まず環境固定を終わらせる
2. 残っている feature の `$lib` 直依存を全廃する
3. notifications を実体ある feature にする
4. profiles / settings / bookmarks / notifications route を facade 駆動に揃える
5. `shared` と wrapper を本物の境界か削除対象のどちらかに収束させる

重要なのは、ここから先は「新しい層の追加」ではなく「導入済み層の収束」がテーマだということです。

## 5. 次フェーズの完了定義

次フェーズ完了の定義は次です。

- `pnpm check` が Node 24 で再現可能に動く
- `src/features/**` に `$lib/nostr/*` と `$lib/stores/*` の直依存が残らない
- `features/notifications` が購読本体と read-model を持つ
- `features/profiles` が comments query と follow count query の本体を持つ
- `profile` / `notifications` / `settings` / `bookmarks` route が feature facade を使うだけになる
- `shared/nostr/*` と `shared/browser/*` が pass-through だけのファイル群でなくなる
- 旧 store が wrapper か app-shell state に縮小する

## 6. 優先順位

優先順位は次に更新します。

1. 実行環境固定
2. feature の `$lib` 直依存全廃
3. notifications feature 実体化
4. profiles feature 実体化
5. route / settings の facade 化
6. shared / wrapper の収束
7. transport cleanup
8. cleanup

### この順序にする理由

- 環境問題が未解決だと回帰確認が不可能だから
- feature の `$lib` 直依存を消さないと、それ以降の構造議論が名目化するから
- notifications と profiles が最大の read-side 未完了だから
- route 整理は feature 実体ができてからのほうが安全だから
- transport cleanup は最後に残った点を閉じる仕事だから

## 7. 実行計画

## Phase 0: 実行環境固定

### 目的

検証できる状態を作る。

### やること

- `pnpm check` が Node 24 を使うように修正する
- `pnpm test` のベースラインを記録する
- CI / ローカルの Node 解決経路を一致させる

### 完了条件

- `node -v`
- `pnpm exec node -v`
- `pnpm check`
- `pnpm test`

が同一 Node 24 系で整合する。

## Phase 1: feature の `$lib` 直依存全廃

### 目的

feature を本当に独立した境界にする。

### やること

- bookmark / follow / relay / mute action を `$shared/nostr/gateway` 経由に切り替える
- comment subscription を `$shared/nostr/gateway` 経由へ切り替える
- comment repository を `$shared/nostr/gateway` 経由へ切り替える
- profile queries を `$shared/nostr/gateway` 経由へ切り替える
- nip19 resolver を `$shared/nostr/gateway` 経由へ切り替える

### lint 強化

- `src/features/**` に対して `$lib/nostr/*` / `$lib/stores/*` を禁止する
- 例外が必要なら `shared` に明示的 adapter を置く

### 完了条件

- `rg -n '\$lib/' src/features` で残るものが移行注記のみになる

## Phase 2: notifications の feature 実体化

### 目的

最大の未完 feature を閉じる。

### やること

- `features/notifications/application/notification-subscription.ts` に購読本体を移す
- `features/notifications/ui/notifications-view-model.svelte.ts` を追加する
- unread, filter, page state, target preload, profile preload を route から移す
- `lib/stores/notifications.svelte.ts` を wrapper 化する

### 完了条件

- notifications route が read-model を持たない
- notification store が旧本体でなくなる

## Phase 3: profiles の feature 実体化

### 目的

profile route の orchestration を剥がす。

### やること

- `features/profiles/application/profile-queries.ts` を gateway 経由へ切り替える
- profile comments pagination を feature 側へ寄せる
- profiles view model を追加する
- route は pubkey 解決と facade 呼び出しだけにする

### 完了条件

- profile route が comments query と action orchestration を持たない
- profile route が raw query を持たない

## Phase 4: route / settings の facade 化

### 目的

周辺 route を同じルールへ揃える。

### やること

- bookmarks page を bookmarks facade 駆動へ揃える
- notifications page を notifications facade 駆動へ揃える
- profile page を profiles facade 駆動へ揃える
- settings relay UI を relays feature view model 経由へ揃える
- `useCachedLatest` 依存を route/component から抜く

### lint 強化

- `src/web/routes/**` に対する `$lib/stores/*` 依存を段階的に禁止する
- 少なくとも `profile`, `notifications`, `bookmarks`, `settings` は禁止対象にする

### 完了条件

- 主要 route が feature facade 以外の業務依存を持たない

## Phase 5: shared / wrapper の収束

### 目的

中継層を「本物の境界」か「削除対象」へ二分する。

### やること

- `shared/nostr/gateway.ts` の責務を整理する
- `shared/browser/*` が単なる re-export か、明確な契約かを整理する
- pass-through だけの bridge は削除候補として明示する
- 旧 store に削除フェーズコメントを追加する

### 完了条件

- 中継層が名義貸しでなくなる
- wrapper の存続理由が説明できる

## Phase 6: transport cleanup

### 目的

最後に残る raw browser transport を閉じる。

### やること

- extension message handling を `shared/browser/extension` 側へ寄せる
- `NiconicoEmbed.svelte` の raw `message` を bridge 化する
- `player` / `extension` の raw transport 呼び出しを減らす

### 完了条件

- component から raw `window.addEventListener('message')` が消える
- transport の入口が 1 箇所で追える

## Phase 7: cleanup

### やること

- wrapper 削除
- dead code 削除
- import path 正規化
- docs / README 更新

### 完了条件

- `src/lib` が業務本体の置き場でなくなる

## 8. 今回から明示的に禁止すること

- 新しい pass-through bridge を増やすこと
- feature から `$lib/nostr/*` や `$lib/stores/*` を直接 import すること
- route に read-model を置くこと
- 「shared に移しただけ」で完了扱いにすること
- write-side だけ feature 化して read-side を放置すること

## 9. テスト方針

優先するテスト:

- gateway 経由の publish / query integration
- notifications subscribe / unread / filter
- profiles pagination / follow count
- relay settings update
- extension transport / seek bridge

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
2. `features/**` の最後の `$lib` 直依存を消す
3. `notifications` の本体を feature 側へ移す
4. `profiles` の comments query / pagination を feature 側へ移す
5. `profile` / `notifications` / `settings` / `bookmarks` route を facade 化する
6. 最後に shared / wrapper / transport を収束させる

## 11. 最終判断

今回の確認で分かったことは次です。

- 入口づくりはかなり進んだ
- 構造も前回より明確になった
- しかし、まだ ownership が旧構造に残る箇所が少数だが重要な形で残っている

したがって、次の完全リファクタリングは「拡張」ではなく「収束」です。

- 残る feature 直依存を消す
- notifications / profiles を終わらせる
- route を facade 利用に揃える
- 中継層を本物にするか削除対象にする

ここを終えれば、その次は cleanup が主題になります。
