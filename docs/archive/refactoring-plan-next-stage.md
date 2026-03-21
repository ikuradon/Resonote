# Resonote 完全リファクタリング次段計画書

最終更新: 2026-03-20
対象リポジトリ: `Resonote`
前提文書:

- `docs/refactoring-plan.md`
- `docs/refactoring-plan-detailed.md`
- `docs/refactoring-plan-followup.md`

## 1. この文書の位置づけ

この文書は、前回の追補計画後に実施されたリファクタリングを確認したうえで、次の段階で何を完了させるべきかを再定義する実行計画です。

前回までの結論は「`$lib` に残る infra 本体を feature / shared へ引き上げること」でした。
今回の確認結果では、その作業は確かに前進しました。
したがって、次段階のテーマは「導入した `shared` / `feature` 境界を実体のある境界に仕上げること」です。

## 2. 今回確認できた進捗

### 2.1 `app/bootstrap` は `$shared` へ寄った

次のファイルは、前回より依存方向が改善しています。

- `src/app/bootstrap/init-app.ts`
- `src/app/bootstrap/init-session.ts`
- `src/app/bootstrap/init-notifications.svelte.ts`

`$lib/stores/*` と `$lib/nostr/*` の直 import は減り、`$shared` 経由に寄っています。
これは app 層の依存反転として正しい進展です。

### 2.2 `shared/nostr` と `shared/browser` の入口が作られた

新たに次の入口が作られています。

- `src/shared/nostr/gateway.ts`
- `src/shared/nostr/relays-config.ts`
- `src/shared/browser/auth.ts`
- `src/shared/browser/bookmarks.ts`
- `src/shared/browser/notifications.ts`
- `src/shared/browser/player.ts`
- `src/shared/browser/extension.ts`
- `src/shared/browser/seek-bridge.ts`
- `src/shared/browser/stores.ts`

これにより、`features` や `app` が `$lib` に直接ぶら下がる箇所は前回よりかなり減りました。

### 2.3 feature 側の `$lib` 依存はさらに減った

`src/app` と `src/features` の `$lib` 依存は、前回より大きく減っています。
特に次は改善が確認できます。

- `features/comments/application/*` は `$shared/nostr/gateway` を利用
- `features/content-resolution/ui/*` は `$shared/browser/*` を利用
- `features/follows/infra/wot-fetcher.ts` が導入され、follow read-side の一部が feature 側へ移り始めた

### 2.4 seek の browser transport は一段整理された

`src/shared/browser/seek-bridge.ts` が導入され、seek custom event の入口は集約され始めています。
これは playback 整理の前進です。

### 2.5 lint はさらに強くなった

`eslint.config.js` では、route/layout と UI component の infra 直結が warning ではなく error になっています。
これは「守るべき方針」が実装規約として強くなったことを意味します。

## 3. それでも残っている問題

進捗はありますが、まだ完了には遠いです。
現状の主要問題は次です。

### 3.1 `shared` gateway/bridge の多くが re-export のまま

今の `shared/nostr/gateway.ts` と `shared/browser/*.ts` の多くは、実体を持つ gateway というより re-export 層です。

これは移行の途中段階としては有効ですが、まだ次の問題を残しています。

- 実装本体が依然として `src/lib` に残る
- abstraction が実体を持たないため、境界として弱い
- `shared` 配下に置いただけで責務分離が完了したように見えてしまう

### 3.2 notifications の実体はまだ旧 store にある

`src/features/notifications/application/notification-subscription.ts` は、現状ではまだ実装本体ではありません。
一方で本体は依然として `src/lib/stores/notifications.svelte.ts` にあります。

ここに残っているもの:

- rx-nostr 購読開始
- follow-comment 制限
- mute / word mute 適用
- unread 状態
- localStorage 管理

つまり notifications は、いまも実質的に feature 化未完了です。

### 3.3 profile route は依然として旧構造直結

`src/web/routes/profile/[id]/+page.svelte` はまだ次を直接扱っています。

- `fetchProfile`
- `followUser` / `unfollowUser`
- `muteUser`
- `fetchProfileComments`
- follows count のための raw Nostr query

profile は route 分割済みですが、feature facade で駆動されている状態ではありません。

### 3.4 notifications route も依然として read-model を抱えている

`src/web/routes/notifications/+page.svelte` はまだ次を持っています。

- target comment preload
- visible profile preload
- unread 判定 state
- filter state
- page pagination state

つまり、page route が feature view model の役割を兼ねています。

### 3.5 settings / relays 周辺も旧構造のまま

`src/web/routes/settings/RelaySettings.svelte` はまだ次に依存しています。

- `src/lib/stores/relays.svelte.ts`
- `src/lib/nostr/cached-nostr.svelte.ts`
- `src/lib/nostr/relays.ts`

settings の relay 管理は、まだ feature view model 経由へ揃っていません。

### 3.6 read-side の本体はまだ store に多く残る

特に次の store は「wrapper 以上、本格 feature 未満」です。

- `src/lib/stores/follows.svelte.ts`
- `src/lib/stores/notifications.svelte.ts`
- `src/lib/stores/relays.svelte.ts`
- `src/lib/stores/profile.svelte.ts`
- `src/lib/stores/mute.svelte.ts`
- `src/lib/stores/emoji-sets.svelte.ts`

write-side だけ先に feature 化され、read-side は依然として store 本体に残る構図が続いています。

### 3.7 playback / extension は整理途中

seek は整理され始めましたが、まだ次が残っています。

- `src/lib/stores/extension.svelte.ts` の raw `message` / `postMessage`
- `src/lib/components/NiconicoEmbed.svelte` の raw `message`
- `shared/browser/player.ts` / `shared/browser/extension.ts` がまだ re-export に近い

つまり browser transport は「集約開始」段階であって「集約完了」ではありません。

### 3.8 実行環境固定は未解決

今回も次の状態でした。

- `node -v` は `v24.14.0`
- `pnpm exec node -v` も `v24.14.0`
- しかし `pnpm check` は Node `v20.11.1` を見て失敗

この問題はまだ最優先です。

## 4. 今回の結論

次の完全リファクタリング方針は、以下の 5 点に絞ります。

1. `shared` gateway/bridge を「re-export 層」から「実体を持つ境界」へ進める
2. `notifications` と `profiles` の read-side を feature 実体へ移す
3. `settings` / `bookmarks` / `notifications` / `profile` route を feature facade 駆動へ揃える
4. `extension` / `playback` の browser transport を本当に 1 箇所へ閉じ込める
5. その後に wrapper と旧 store 本体を縮小・削除する

重要なのは、次段階では「新しいフォルダを増やすこと」自体が目的ではないという点です。
目的は、今ある `shared` と `features` を本物の境界に仕上げることです。

## 5. 次段階の完了定義

次段階が完了したとみなす条件は次です。

- `shared/nostr/*` と `shared/browser/*` が単なる re-export ではなく、実体ある gateway / bridge になる
- `features/notifications` が購読本体と read-model を持つ
- `features/profiles` が comments query と follow count query を持つ
- `profile` / `notifications` / `settings` / `bookmarks` route が feature facade を使うだけになる
- `lib/stores/notifications.svelte.ts` と `lib/stores/follows.svelte.ts` と `lib/stores/relays.svelte.ts` が wrapper に近づく
- `extension` と `playback` の raw transport が component / route から消える
- `pnpm check` が Node 24 で再現可能に動く

## 6. 新しい優先順位

優先順位は次に更新します。

1. 実行環境固定
2. `shared` gateway/bridge の実体化
3. notifications の feature 実体化
4. profiles の feature 実体化
5. settings / bookmarks / notifications / profile route の facade 化
6. extension / playback transport の最終整理
7. read-side store の wrapper 化
8. cleanup

### この順序にする理由

- いま一番弱いのは `shared` 境界の中身だから
- 次に重いのは notifications と profiles の read-side 未分離だから
- route 整理は、その feature 実体化が済んだ後のほうが安全だから
- playback / extension は横断影響が大きいので、route/read-side より後ろに置くほうが衝突が少ないから

## 7. 実行計画

## Phase 0: 実行環境固定の完了

### 目的

検証不能状態を終わらせる。

### やること

- `pnpm check` が Node 24 を使うように修正する
- `pnpm test` のベースラインを記録する
- Node / pnpm の解決経路を CI とローカルで揃える

### 完了条件

- `node -v`
- `pnpm exec node -v`
- `pnpm check`
- `pnpm test`

が同一 Node 24 系で再現する。

## Phase 1: shared gateway / bridge の実体化

### 目的

`shared` を「名前だけの中継層」から「安定した境界」にする。

### やること

- `shared/nostr/gateway.ts` を責務別に整理する
  - publish
  - latest event query
  - rx-nostr access
  - event DB access
- `shared/browser/*` を責務別に整理する
  - auth bridge
  - bookmarks state bridge
  - notifications state bridge
  - player bridge
  - extension bridge
- re-export だけのファイルを減らし、必要な型・契約・薄い adapter をここで固定する
- `shared` 以外から `lib/nostr/*` や `lib/stores/*` を直接触らない方針を lint で強化する

### 完了条件

- `features/**` が `$shared` 経由だけで必要な infra へ届く
- `app/**` が `$shared` 経由だけで store / infra を扱える
- `shared` 以外の新規 `$lib/nostr/*` 依存が増えない

## Phase 2: notifications の feature 実体化

### 目的

最も未完了な read-side feature を終わらせる。

### やること

- `features/notifications/application/notification-subscription.ts` に実装を移す
- `features/notifications/ui/notifications-view-model.svelte.ts` を追加する
- unread, filter, pagination, target preload, profile preload の責務を route から抜く
- `lib/stores/notifications.svelte.ts` は wrapper へ縮小する
- `shared/browser/notifications.ts` は wrapper ではなく feature entry point に寄せる

### 完了条件

- notifications route が read-model を持たない
- notification subscription 本体が `features/notifications` にある
- `lib/stores/notifications.svelte.ts` が旧本体ではなくなる

## Phase 3: profiles の feature 実体化

### 目的

profile page の query / action / pagination を route から剥がす。

### やること

- `features/profiles/application/profile-queries.ts` を `$shared/nostr/gateway` ベースへ寄せる
- follow count query を feature 側へ移す
- `profiles-view-model.svelte.ts` を追加する
- profile route は pubkey 解決と view model 呼び出しだけにする
- `ProfileHeader.svelte` / `ProfileComments.svelte` も feature UI へ寄せるか、少なくとも feature view model 経由に揃える

### 完了条件

- profile route が raw query を持たない
- profile route が store orchestration を持たない
- profiles feature が pagination と query を所有する

## Phase 4: settings / bookmarks / notifications / profile route の facade 化

### 目的

周辺 route を同じ規約へ揃える。

### やること

- bookmarks route を bookmarks feature facade 経由へ寄せる
- settings の relay 管理を relays feature view model 経由へ寄せる
- settings の通知 filter も notifications feature 経由へ寄せる
- `cached-nostr.svelte.ts` 依存を settings component から剥がす

### 完了条件

- route / settings component が feature facade の呼び出しに揃う
- route が store 本体や query の組み立てを持たない

## Phase 5: extension / playback transport の最終整理

### 目的

browser transport を本当に 1 箇所へ閉じ込める。

### やること

- `shared/browser/seek-bridge.ts` へ seek 経路を完全統一する
- `lib/stores/player.svelte.ts` から raw custom event を抜く
- `lib/stores/extension.svelte.ts` の raw message bus を `shared/browser/extension.ts` または feature 側実体へ寄せる
- `NiconicoEmbed.svelte` の raw `message` 受信を共通 bridge 化する

### 完了条件

- component が raw `window.addEventListener('message')` を持たない
- component / store が raw `window.dispatchEvent('resonote:seek')` を持たない
- extension 連携の入口が 1 箇所で読める

## Phase 6: store の wrapper 化と cleanup

### 目的

旧本体を shrink し、cleanup 可能な状態へ入る。

### やること

- `lib/stores/follows.svelte.ts` の read-side 実体をさらに feature 側へ寄せる
- `lib/stores/relays.svelte.ts` の fetch / status 管理を feature 側へ寄せる
- `lib/stores/profile.svelte.ts` の query/restore 責務を見直す
- wrapper の削除フェーズを明文化する
- dead code を消す

### 完了条件

- 主要 store が wrapper / state facade に縮小する
- `lib` が業務ロジックの本体置き場でなくなる

## 8. 今回から追加する設計ルール

### 8.1 `shared` の責務を曖昧にしない

`shared` に置いてよいのは:

- gateway
- bridge
- 契約型
- 純粋 helper

`shared` に置いてはいけないのは:

- feature 固有の view model
- route 専用の orchestration
- 単なる「場所だけ shared にした巨大 store」

### 8.2 新しい re-export wrapper を安易に増やさない

今後は、`shared` や `features` に新しい re-export を作る場合、次のどちらかでなければならない。

- 移行中の一時 adapter
- 明確な境界契約

単なる import path 変更のためだけの wrapper は増やさない。

### 8.3 route の「軽さ」を false positive にしない

route が軽く見えても、feature/ui や shared が代わりに膨らんでいるだけなら完了ではありません。
今後は「責務が減ったか」だけでなく「どこへ移ったか」まで見る。

## 9. テスト方針

次段階で優先するテストは次です。

- gateway 単位の publish / query integration
- notifications subscribe / unread / filter
- profile pagination / follow count query
- relay settings update
- seek bridge / extension bridge

E2E 最低ライン:

- content page を開ける
- comment できる
- bookmark を追加 / 削除できる
- notifications を開ける
- profile を開ける
- relay 設定を編集できる

## 10. 直近の次アクション

いま着手すべき順番は次です。

1. `pnpm check` の Node 24 問題を解決する
2. `shared/nostr/gateway.ts` と `shared/browser/*` の責務を再設計し、re-export を減らす
3. `notifications` の実装本体を feature 側へ移す
4. `profiles` の query / count / pagination を feature 側へ移す
5. その後に settings / bookmarks / notifications / profile route を facade 化する
6. 最後に extension / playback transport を閉じる

## 11. 最終判断

今回の確認で分かったことは明確です。

- 入口作りのフェーズはかなり進んだ
- 依存方向も前回より改善した
- しかし、まだ「実体は旧構造、入口だけ新構造」という領域が多い

したがって次段階でやるべきことは、これです。

- 導入済みの境界を本物にする
- read-side を feature 側へ引き取る
- route を facade 利用に揃える
- browser transport を本当に閉じる

ここをやり切れば、その次は cleanup が主題になります。
