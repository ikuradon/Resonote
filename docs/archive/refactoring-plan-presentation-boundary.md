# Resonote 表示層境界完成計画書

作成日: 2026-03-20

## 1. この文書の位置づけ

`docs/refactoring-plan-surface-completion.md` では、`$shared/browser` / `$shared/nostr` を最終公開境界として完成させる方針を定義した。2026-03-20 時点の再確認では、その方針のうち route 側はかなり前進している。

今回の結論は、次の一点に尽きる。

> いま最大の未完了領域は route ではなく `src/lib/components` である。

つまり次段階は、`shared` の裏側を先に差し替えることではない。まず component 層から legacy store 直結を退かせ、表示層の入口を `shared` / `features` に一本化する。そのうえで内部実装を差し替える。

本書は、そのための「表示層境界完成フェーズ」の計画書である。

## 2. 実装状況確認

### 2.1 検証状況

- `pnpm check` は通過している。
- `pnpm lint` は通過している。
- `pnpm test` は通過している。
  - 62 files / 864 tests passed

### 2.2 前進した点

- route 直下の stateful `$lib/stores/*` 依存は、ほぼ `locale` と `dev-tools` 相当まで縮小した。
- route 直下の stateful `$lib/nostr/*` 依存も、ほぼ解消された。
- `notifications` page は `cachedFetchById` を `$shared/nostr/cached-query.js` 経由へ移している。
- `profile` page は `fetchProfileComments` を `$features/profiles/application/profile-queries.js` 経由へ移している。
- `AudioEmbed.svelte` は `player` 依存を `$shared/browser/player.js` へ切り替えている。
- `pnpm check` / `pnpm lint` / `pnpm test` がすべて通るため、次段は境界整理に専念できる。

### 2.3 現在の主な残課題

- `src/shared/browser/*.ts` の大半は、まだ legacy store の re-export 層である。
- `src/shared/nostr/*.ts` も、依然として re-export 層が中心である。
- `src/lib/components/**` には、relative import で legacy store を直接読む component がまだ多い。
- そのため、`$shared` は route から見れば公開面だが、component 層から見ればまだ迂回可能である。

特に次の点が大きい。

- `src/lib/components` 配下で `../stores/(player|profile|relays|auth|follows|mute|notifications|extension).svelte.js` を直接読む component が 16 ファイル残っている。
- `src/lib/components/NotificationBell.svelte` は通知一覧 preview、target comment preload、profile preload、mark-as-read を component 内で持っている。
- `src/lib/components/CommentList.svelte` は filter、player 追従、profile preload、mute、reaction、reply、delete、toast をまとめて持つ大きな orchestration component のままである。
- `src/lib/components/NiconicoEmbed.svelte` は raw `message` / `postMessage` と player store 依存を component 内に持っている。
- `src/lib/components/YouTubeEmbed.svelte`、`MixcloudEmbed.svelte`、`PodbeanEmbed.svelte`、`SpotifyEmbed.svelte`、`SpreakerEmbed.svelte`、`SoundCloudEmbed.svelte`、`VimeoEmbed.svelte` なども、player store 直結が残っている。

### 2.4 lint の盲点

現在の `eslint.config.js` は、`$lib/stores/*` や `$lib/nostr/*` の alias import を一部制限している。しかし、component で使われている多くの legacy 依存は `../stores/*.svelte.js` の relative import であり、現行ルールでは検出されない。

これは重要である。いまの問題は「境界がない」ことではなく、「境界があるのに bypass できる」ことである。

## 3. 今回の判断

次段階の完全リファクタリング方針は、次の一文に要約できる。

> まず表示層の入口を閉じる。`src/lib/components/**` からの legacy store 直結を禁止し、component が `shared` / `features` だけを見て動く状態を先に作る。その後で `shared` の裏側実装を差し替える。

この順序にする理由は明確である。

- route 側はすでにかなり片付いている。
- いま shared の裏側を先に動かしても、component 層が legacy store を直接読んでいる限り blast radius が広い。
- consumer を先に `shared` / `features` へ寄せれば、その後の内部差し替えは小さく安全になる。

したがって、次段の主戦場は `shared` そのものではなく、`component -> shared/features` への依存一本化である。

## 4. 新しい設計原則

### 4.1 component の依存先

- `src/lib/components/**` が依存してよい stateful 境界は、原則として `$shared/browser/*`、`$shared/nostr/*`、`$features/*` のみとする。
- `../stores/*.svelte.js` への direct import は、UI 補助を除き禁止する。
- `../nostr/*.js` への direct import も、pure helper 以外は禁止する。

### 4.2 view model の置き場

- 表示 component が business orchestration を持つ場合は、feature/ui view model へ寄せる。
- page と panel が似た責務を持つなら、view model を共有する。
- 具体例:
  - notifications page と `NotificationBell`
  - comments page state と `CommentList`

### 4.3 shared の役割

- `shared` は「route から見える façade」ではなく、「表示層全体が使う公開 API」として扱う。
- route だけでなく component も `shared` を通るようになって初めて、shared を実体化する意味が出る。

### 4.4 低優先の例外

- `locale`
- `toast`
- `dev-tools`
- 純粋関数としての decode / formatting / content-link helper

これらは現時点の主戦場ではない。stateful orchestration を先に片付ける。

## 5. 完了条件

次段階を完了とみなす条件は次のとおり。

1. `src/lib/components/**` から browser/business store への relative import が主要箇所で消えている。
2. embed 群、notification bell、comment 系 component、profile 表示 component が `shared` / `features` 経由で動く。
3. `NotificationBell` と notifications page の preload/read/filter 系ロジックが再利用可能な view model に寄る。
4. `CommentList` が presentational component 群と orchestration/view model に分かれる。
5. `shared/browser/player.ts` と `shared/browser/profile.ts` などが、component の正式依存先として定着する。
6. lint が relative import による boundary bypass を止められる。
7. その後に legacy store を縮退しても、component 側修正がほとんど不要な状態になる。

## 6. 優先順位

優先順位は次で固定する。

1. component 層の boundary bypass を止める
2. notification bell / comment list の view model 化
3. embed / player / profile consumer の shared 経由化
4. その後に shared の裏側実装を差し替える
5. lint hardening を error まで引き上げる
6. legacy store cleanup

前回計画より優先順位を変える。`profile` や `relays` の実体移管そのものより、まず consumer 側を閉じるほうが、残り全体の変更コストを下げる。

## 7. 実行フェーズ

### Phase 0: lint で bypass を可視化する

目的:
relative import による境界迂回を止める。

作業:

- `src/lib/components/**/*.svelte` に対し、`../stores/(player|profile|relays|auth|follows|mute|notifications|extension).svelte.js` を warning にする。
- 同様に、stateful `../nostr/*` helper の direct import も warning 化する。
- `src/web/routes/**/*.svelte` についても、stateful relative import を段階的に警告対象へ含める。
- allowlist は `toast`、`locale`、`dev-tools` のような UI 補助に限定する。

完了条件:

- どの component が legacy state を直結しているかが lint で見える。

### Phase 1: player / profile / notifications の consumer 移行

目的:
最も広く使われる stateful 依存を component 層から退かせる。

作業:

- embed 群を `shared/browser/player.js` 経由へ統一する。
- `LoginButton.svelte`、`NotificationBell.svelte`、`CommentCard.svelte`、`CommentList.svelte` の profile 依存を `shared/browser/profile.js` 経由へ寄せる。
- notification 関連の read / unread / latest preview は `shared/browser/notifications.js` か feature/ui view model へ寄せる。
- `RelayStatus.svelte` も `shared/browser/relays.js` 側へ合わせる。

完了条件:

- component 層で最も多い `player` / `profile` / `notifications` / `relays` の直結が消える。

### Phase 2: NotificationBell と notifications page の統合

目的:
通知 UI の重複 orchestration を解消する。

作業:

- notifications page 向けと bell/panel 向けの notification view model を設計する。
- target comment preload、visible profile preload、mark-as-read の責務を component/page から抜く。
- page と bell で共有できる selector と loader を feature/ui 側へ寄せる。

完了条件:

- `NotificationBell.svelte` と `/notifications` page が、それぞれ独自に preload ロジックを持たない。

### Phase 3: CommentList の分解

目的:
最大の orchestration component を解体する。

作業:

- `CommentList.svelte` を presentational component と orchestration/view model に分ける。
- follow filter、mute 判定、player 追従、profile preload、reply state、reaction action、delete action を分離する。
- `CommentCard.svelte`、`CommentFilterBar.svelte`、`CommentForm.svelte` の依存も、それに合わせて整理する。

完了条件:

- comment UI 群が store 密結合から外れ、責務分担が説明可能になる。

### Phase 4: transport と shared 実体の最終整理

目的:
consumer を shared へ寄せた後で、shared の中身を本物にする。

作業:

- `shared/browser/player.ts`、`shared/browser/profile.ts`、`shared/browser/relays.ts`、`shared/browser/extension.ts` を単なる re-export から進める。
- `NiconicoEmbed.svelte` と `lib/stores/extension.svelte.ts` に残る `message` / `postMessage` を shared protocol へ寄せる。
- 必要に応じて `shared/nostr/cached-query.ts` なども API と実装を整理する。

完了条件:

- shared が、consumer から見て安定した公開境界として機能する。

### Phase 5: legacy cleanup

目的:
境界完成後の残骸を整理する。

作業:

- consumer が消えた `lib/stores` / `lib/nostr` 実装を wrapper 化または削除する。
- docs の最新版を一本化し、終了したフェーズを整理する。
- lint を warning から error に引き上げる。

完了条件:

- legacy store を参照しなくても表示層が成立する。

## 8. 新しい禁止事項

以後のリファクタリングでは、次を禁止する。

- `src/lib/components/**` に新しい `../stores/*.svelte.js` 依存を追加すること
- `NotificationBell` や `CommentList` にさらに orchestration を積み増すこと
- embed component ごとに独自 transport protocol を増やすこと
- shared を通さずに consumer から legacy 実装へ直接つなぐこと

## 9. 検証方針

各フェーズで最低限以下を回す。

- `pnpm check`
- `pnpm lint`
- `pnpm test`

加えて、次の画面スモークを手動確認する。

- notification bell: 開閉、既読化、preview 表示、リンク遷移
- notifications page: 一覧表示、filter、target preview、profile 表示
- comments: filter、seek 連動、reaction、reply、delete、mute
- embeds: 再生状態更新、seek 連携、埋め込み別の再生反映
- profile / login / relay status: 表示名、profile fetch、relay 状態表示

## 10. 直近の着手順

直近の順序は次で固定する。

1. component relative import を lint warning 化する。
2. embed 群と profile/notification consumer を `shared` 経由へ寄せる。
3. `NotificationBell` と `CommentList` の view model 分解を行う。
4. consumer が shared に揃った後で、shared の裏側実装を差し替える。
5. 最後に lint を error 化し、legacy store を縮退する。

この順序なら、表示層の入口を先に閉じ、その後に内部実装を安全に差し替えられる。
