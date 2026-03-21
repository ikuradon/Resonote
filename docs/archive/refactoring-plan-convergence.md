# Resonote 完全リファクタリング収束計画書

作成日: 2026-03-20

## 1. この文書の位置づけ

前回までの計画では、`src/features` / `src/app` から `$lib` 直接依存を剥がし、`shared` の入口を整備することを主眼にしていた。2026-03-20 時点の確認では、その段階はおおむね完了している。

次の主戦場は、層を新しく増やすことではない。`route` / `layout` / `lib/stores` / `shared` に残っている実体責務を、それぞれ本来の所有者へ収束させることにある。

本書は、そのための「最終収束フェーズ」の計画書である。

## 2. 実装状況確認

### 2.1 進捗として評価できる点

- `pnpm check` は通過している。
- `pnpm lint` も通過している。
- `src/features/**` / `src/app/**` からの `$lib/nostr/*` / `$lib/stores/*` 直接依存は、現状ほぼ解消されている。
- `eslint.config.js` には、feature/app から `$lib/nostr/*` / `$lib/stores/*` を禁止するルールが入っている。
- `src/shared/nostr/gateway.ts` と `src/shared/browser/seek-bridge.ts` により、境界の入口自体は明示された。
- content page と comments 周辺は前回までのボトルネックではなくなった。

### 2.2 依然として未完了の点

- `src/features/notifications/application/notification-subscription.ts` はまだ実体ではなく、通知購読の本体は feature 側に閉じていない。
- `src/web/routes/notifications/+page.svelte` は、通知 filter / pagination / unread 判定 / target comment preload / profile preload を route 側で抱えている。
- `src/lib/stores/notifications.svelte.ts` は薄くなったが、notifications feature の page/view model がまだ不足している。
- `src/features/profiles/application/profile-queries.ts` は feature 化されている一方、profile read-side 全体の責務はまだ route/store 側に散っている。
- `src/web/routes/profile/[id]/+page.svelte` と `src/web/routes/profile/[id]/ProfileHeader.svelte` は、依然として `$lib/stores/profile.svelte.ts` と `$lib/stores/follows.svelte.ts` への依存が強い。
- `src/web/routes/settings/RelaySettings.svelte`、`src/web/routes/bookmarks/+page.svelte`、`src/web/routes/+layout.svelte` も `$lib/stores/*` 依存のままである。
- `src/shared/nostr/gateway.ts`、`src/shared/browser/player.ts`、`src/shared/browser/extension.ts` は、境界名を持っているが中身は re-export 中心で、adapter としては未成熟である。
- raw browser transport はまだ完全に隔離されていない。`src/lib/stores/extension.svelte.ts` と `src/lib/components/NiconicoEmbed.svelte` に `message` / `postMessage` が残っている。
- `src/web/routes/**` と `src/lib/components/**` には、`$shared/*` の直接利用がほぼ入っておらず、依然として `$lib/stores/*` による旧 facade に乗っている。

## 3. 現在の結論

次段階の完全リファクタリング方針は、以下の一文に要約できる。

> `feature 増設フェーズ` はほぼ終わった。これ以降は `責務収束フェーズ` とし、`notifications` / `profiles` / `settings` / `layout` を中心に、route と legacy store を composition 専用へ縮退させる。

つまり、次にやるべきことは「新しい層を足すこと」ではなく、「すでに作った境界を本物にすること」である。

## 4. 次段階の設計原則

### 4.1 route / layout の役割

- `src/web/routes/**` は composition と表示制御だけを持つ。
- subscription 開始、query 発火、browser transport、複数 store の整合調停は route に置かない。
- route が保持してよい状態は、タブ選択、ローカル開閉、表示件数のような純 UI 状態に限定する。

### 4.2 feature/application の役割

- feature/application は、その機能に属する query / subscription / side effect orchestration を所有する。
- page 単位で必要な派生状態は、feature/ui の view model に寄せる。
- route が複数の feature を組み合わせる場合でも、整合処理の中心は feature または app に置く。

### 4.3 shared の役割

- `src/shared/nostr/**` は Nostr infra の契約面を所有する。
- `src/shared/browser/**` は browser transport と player/extension bridge を所有する。
- `shared` は単なる名前付き re-export 層ではなく、型・引数・戻り値・イベント名・transport protocol を固定する adapter 層として扱う。

### 4.4 legacy `$lib` の扱い

- `src/lib/stores/**` と `src/lib/nostr/**` は、新規実装の置き場として使わない。
- 既存 module を残す場合も、役割は compatibility wrapper のみとする。
- compatibility wrapper に実体ロジックを戻す変更は禁止する。

## 5. 完了条件

次段階を「完了」と呼ぶ条件は次のとおり。

1. `notifications` の購読・既読・filter・target preload・profile preload が feature/view model 側に閉じている。
2. `profile` page の read-side が feature/view model 側へ移り、route が `$lib/stores/profile.svelte.ts` に依存しない。
3. `settings` / `bookmarks` / `+layout` の business orchestration が feature/app/shared 側へ移り、route/layout の責務が軽くなる。
4. `shared/nostr` と `shared/browser` の主要入口が、実体ある adapter か、少なくとも adapter へ移行済みと読める構造になる。
5. `src/web/routes/**` と `src/lib/components/**` の `$lib/stores/*` 依存が大幅に縮小し、主要ページではゼロになる。
6. lint が、feature/app だけでなく route/component 側の境界逆流も防げる状態になる。
7. 旧 store は削除されるか、薄い互換 wrapper としてのみ残る。

## 6. 優先順位

優先順位は以下で固定する。

1. `notifications` の end-to-end feature 化
2. `profiles` read-side と profile page facade 化
3. `settings` / `bookmarks` / `+layout` の facade 化
4. `shared/nostr` / `shared/browser` の実体化
5. lint 境界強化
6. legacy wrapper の削除または最終縮退

前回まで優先度が高かった content page / comments は、今回は最優先ではない。現時点では、そこで新しい層を増やすより、通知・プロフィール・設定系を閉じたほうが全体の収束に効く。

## 7. 実行フェーズ

### Phase 0: 収束ルールの明文化

目的:
route/store/shared の責務逆流を防ぐ。

作業:

- `docs/` の最新版として本計画書を基準にする。
- `eslint.config.js` に次の段階的ルールを追加する。
- `src/web/routes/**` からの `$lib/stores/*` 依存を警告対象にする。
- `src/lib/components/**` からの `$lib/stores/player.svelte.ts` / `$lib/stores/extension.svelte.ts` 依存を警告対象にする。
- warning で移行を進め、主要ページ移行後に error へ引き上げる。

完了条件:

- 新規コードが route/store 逆流を起こしにくい状態になる。

### Phase 1: notifications 完了

目的:
通知機能を route 主導から feature 主導へ切り替える。

作業:

- `src/features/notifications/application/notification-subscription.ts` に実体を持たせる。
- `src/features/notifications/ui/` に notifications page 用 view model を追加する。
- unread 判定、filter、pagination、target comment preload、profile preload を feature 側へ移す。
- `src/web/routes/notifications/+page.svelte` は render 中心へ縮退させる。
- `src/lib/stores/notifications.svelte.ts` は feature facade の互換 wrapper に限定する。

完了条件:

- notifications page が feature/view model のみで成立する。
- route から通知ドメイン固有の非表示ロジックと preload ロジックが消える。

### Phase 2: profiles 完了

目的:
profile の read-side と page orchestration を feature 側へ移す。

作業:

- `src/features/profiles/**` に profile read-side の取得・cache restore・追加 fetch・NIP-05 補助の責務を寄せる。
- profile comments pagination も feature 側で ownership を明確にする。
- `src/web/routes/profile/[id]/+page.svelte` と `ProfileHeader.svelte` は feature facade を使う形にする。
- follow/mute の画面側結合は feature action/view model で吸収する。
- `src/lib/stores/profile.svelte.ts` は互換 wrapper 化または削除対象へ寄せる。

完了条件:

- profile route が `$lib/stores/profile.svelte.ts` を直接必要としない。
- profile page の取得順序と再取得条件が feature 側で説明可能になる。

### Phase 3: settings / bookmarks / layout 収束

目的:
周辺 route の orchestration を app/feature 側へ寄せ、layout を軽くする。

作業:

- `src/web/routes/settings/RelaySettings.svelte` の relay query/update/reconnect 系責務を feature/app 側へ寄せる。
- `src/web/routes/bookmarks/+page.svelte` を bookmarks feature facade ベースに置き換える。
- `src/web/routes/+layout.svelte` の notification start 条件、relay 初期化、extension 判定などを `src/app/**` に寄せる。
- settings page が旧 store 群の設定窓口になっている状態を解消する。

完了条件:

- `+layout.svelte` は bootstrap 呼び出しと表示制御中心になる。
- settings/bookmarks route が business logic を持たない。

### Phase 4: shared adapter 実体化

目的:
`shared` を名前だけの境界から、責務を持つ adapter 境界へ変える。

作業:

- `src/shared/nostr/gateway.ts` の主要 API を、少なくとも契約面が固定された adapter module として整理する。
- `src/shared/browser/player.ts` を player state/action の境界面として再定義する。
- `src/shared/browser/extension.ts` を raw `message` / `postMessage` transport の唯一の入口にする。
- `src/lib/stores/extension.svelte.ts` と embed component 側に残る transport 実装を shared へ寄せる。
- `seek-bridge.ts` と同水準で、event 名・payload 形式・親子通信 protocol を shared 側に集約する。

完了条件:

- `shared` が「re-export 層」ではなく「protocol を固定する層」になる。
- raw browser transport が複数箇所に散らない。

### Phase 5: lint hardening と legacy cleanup

目的:
再発防止と仕上げを行う。

作業:

- 移行完了後、`src/web/routes/**` から `$lib/stores/*` を error に引き上げる。
- `src/lib/components/**` から browser/business store への直接依存も error 化する。
- 使われなくなった `src/lib/stores/**` / `src/lib/nostr/**` の wrapper を削除する。
- 残す wrapper は deprecated コメントと削除条件を明記する。

完了条件:

- lint が境界逸脱を自動で止める。
- legacy module は互換目的以外で存在しない。

## 8. 新しい禁止事項

以後のリファクタリングでは、次を禁止する。

- route に query / subscription / preload の新規ロジックを追加すること
- `src/lib/stores/**` に新しい business logic を戻すこと
- `shared` に名前だけの re-export を増やすこと
- feature 移行中を理由に、旧 store と新 feature の二重実装を長期放置すること

必要な場合は、「同一フェーズ内で責務を移し切る」ことを条件に一時互換を許容する。

## 9. 検証方針

各フェーズで最低限以下を回す。

- `pnpm check`
- `pnpm lint`
- `pnpm test`

加えて、以下の画面スモークを手動確認する。

- notifications: 一覧表示、filter、既読化、対象コメント表示
- profile: 読み込み、follow/unfollow、mute、コメント追加読込
- settings: relay 更新、mute 設定、通知設定
- bookmarks: 一覧表示、削除
- content page: 再生、seek、extension 連携

## 10. 直近の着手順

今すぐ着手する順序は次で固定する。

1. notifications page view model を作り、`src/web/routes/notifications/+page.svelte` を最初に薄くする。
2. profiles read-side の ownership を `src/features/profiles/**` に寄せ、profile route を facade 化する。
3. settings / bookmarks / `+layout` を app/feature 経由へ切り替える。
4. その後に `shared/browser` / `shared/nostr` の transport と adapter を仕上げる。
5. 最後に lint を error へ引き上げ、legacy wrapper を削る。

この順序なら、いま残っている大きな責務塊を先に崩し、その後に境界を固めて、最後に cleanup だけを残す構成にできる。
