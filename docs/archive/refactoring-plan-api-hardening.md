# Resonote 公開 API 硬化計画書

作成日: 2026-03-20

## 1. この文書の位置づけ

`docs/refactoring-plan-presentation-boundary.md` では、表示層から legacy store への直結を退かせる方針を定義した。2026-03-20 時点の再確認では、その段階はかなり前進している。

今回の結論は次のとおりである。

> 次の主戦場は `consumer migration` ではない。`shared` を本当の公開 API にし、その背後の実装を `lib/stores` / `lib/nostr` から反転させることが主戦場である。

つまり、いま必要なのは import 置換の継続ではない。公開面と内部実装のねじれを解消し、重複している view-model 相当の処理を feature/shared に集約することだ。

本書は、そのための「公開 API 硬化フェーズ」の計画書である。

## 2. 実装状況確認

### 2.1 検証状況

- `pnpm check` は通過している。
- `pnpm lint` は通過している。
- `pnpm test` は通過している。
  - 62 files / 864 tests passed

### 2.2 前進した点

- `src/lib/components/**` から browser/business store を直接読む経路は大きく減っている。
- `player` / `profile` / `relays` / `auth` / `mute` / `notifications` の consumer は、ほぼ `$shared/browser/*` 経由へ寄っている。
- route 側の stateful `$lib/stores/*` 依存は、ほぼ `locale` と `dev-tools` 相当まで縮小している。
- route 側の stateful `$lib/nostr/*` 依存も、ほぼ解消されている。
- `comments` と `notifications` の旧 store は薄い wrapper になっている。

### 2.3 まだ残っている実体責務

ただし、consumer 側の進捗に対して、内部実装側はまだ揃っていない。

- `src/shared/browser/*.ts` の大半は、依然として `lib/stores` の re-export である。
- `src/shared/nostr/*.ts` も、依然として `lib/nostr` の re-export が中心である。
- `src/lib/stores/profile.svelte.ts` は、profile cache / DB restore / relay fetch / NIP-05 verification の実体をまだ保持している。
- `src/lib/stores/relays.svelte.ts` は、relay status / relay list fetch / fallback / refresh の実体をまだ保持している。
- `src/lib/stores/extension.svelte.ts` は、raw `message` / `postMessage` transport をまだ保持している。
- `src/lib/stores/player.svelte.ts` は軽量だが、extension/seek bridge 連携の中心に残っている。

### 2.4 重複している UI orchestration

次の重複はまだ残っている。

- `src/web/routes/notifications/+page.svelte` と `src/lib/components/NotificationBell.svelte` が、それぞれ target comment preload、profile preload、mark-as-read 周辺のロジックを持っている。
- `src/web/routes/profile/[id]/+page.svelte` は、pubkey decode 後の初期化、follow count、comments pagination、confirm action を page 内に持っている。
- `src/lib/components/CommentList.svelte` は、filter、player follow、profile preload、reply state、reaction/delete action、mute などを集中的に持っている。

### 2.5 いま残っている `$lib/nostr` 参照の性質

現在 route / component に残る `$lib/nostr/*` 参照は、件数としては少ない。

- 合計 8 箇所
- その大半は `content-link`、`nip19-decode`、`DEFAULT_RELAYS` のような pure helper / config であり、stateful infra ではない

これは重要である。いま無理に pure helper まで追い出すより、先に stateful 実装の ownership を揃えたほうが合理的である。

## 3. 今回の判断

次段階の完全リファクタリング方針は、次の一文に要約できる。

> これ以降は `consumer の import 整理` より `公開 API の実装反転` を優先する。`shared` を stable API、`lib` を internal implementation / interop に再定義し、重複している page/component ロジックを feature/shared の view model へ集約する。

この順序にする理由は3つある。

- consumer 側はすでにかなり `shared` / `features` に寄っている。
- この段階で `shared` の裏側を本物にしないと、公開面と実装面の責務が逆転したまま残る。
- notifications / comments / profile page に残る重複ロジックを先にまとめないと、内部実装を差し替えても UI 側の責務分散が残る。

## 4. 新しい設計原則

### 4.1 `shared` は façade ではなく API とみなす

- `shared/browser/*` と `shared/nostr/*` は、単なる import alias ではなく、公開 API として扱う。
- consumer が見る型、関数、イベント、購読ライフサイクルは `shared` 側で固定する。
- `lib/stores/*` と `lib/nostr/*` は、最終的に internal implementation か interop wrapper に限定する。

### 4.2 pure helper と stateful implementation を分ける

- `content-link`、`nip19-decode`、formatting のような pure helper は、stateful 実装と同じ優先度で追い出さない。
- 先に片付けるべきなのは、状態を持つもの、購読するもの、transport を持つものである。
- pure helper は最後に「残すか shared へ寄せるか」を一括で判断する。

### 4.3 UI の重複は page/component のまま残さない

- 同じ機能の page と panel が似た preload / selector / mark-as-read を持つなら、feature/shared の view model へ寄せる。
- 具体的には:
  - notifications page と `NotificationBell`
  - profile page と profile-related UI
  - comments page state と `CommentList`

### 4.4 placeholder module を放置しない

- 実体を持たない説明専用 module は、短期ならよい。
- ただし `notification-subscription.ts` のように役割名と実装場所がずれた状態は、次段で解消する。
- 「実装しないなら消す、残すなら責務を一致させる」を原則にする。

## 5. 次段階の完了条件

次段階を完了とみなす条件は次のとおり。

1. `shared/browser/profile.ts`、`shared/browser/relays.ts`、`shared/browser/player.ts`、`shared/browser/extension.ts` が単なる re-export 以上の公開 API になる。
2. `profile` と `relays` の stateful 実体が、`lib/stores` ではなく `shared` または feature/application 側の ownership で説明できる。
3. `NotificationBell` と notifications page の preload/read/filter 系ロジックが共有 view model または shared selector へ寄る。
4. `CommentList` の orchestration が分解され、presentational と view model の境界が明確になる。
5. `notification-subscription.ts` の責務名と実装実態のねじれが解消される。
6. lint が公開 API bypass を止められる。
7. その後に `lib/stores/profile.svelte.ts` / `relays.svelte.ts` / `extension.svelte.ts` を縮退しても、consumer 側の修正が最小になる。

## 6. 優先順位

優先順位は次で固定する。

1. notifications / comments / profile の重複 view-model ロジックを集約する
2. `profile` / `relays` / `extension` / `player` の実装 ownership を反転させる
3. pure helper / config の公開位置ポリシーを決める
4. lint hardening
5. legacy cleanup

前回計画からの変更点は、`component import の整理` を主戦場から外したことにある。そこはかなり進んだので、次は API の背後を本当に整理する段階に入る。

## 7. 実行フェーズ

### Phase 0: 公開 API と内部実装の明文化

目的:
`shared` と `lib` の関係を曖昧なままにしない。

作業:

- `shared/browser/*` と `shared/nostr/*` を公開 API として扱う方針を docs と lint コメントに反映する。
- `lib/stores/*` / `lib/nostr/*` を `internal` と `interop` の2種類に分けて整理方針を決める。
- pure helper と stateful implementation を分類する。

完了条件:

- 次の移行で「どこへ置くべきか」の判断基準が揃う。

### Phase 1: notifications の重複整理

目的:
notifications page と bell の重複ロジックをまとめる。

作業:

- target comment preload を共通化する。
- visible profile preload を共通化する。
- mark-as-read のタイミングと selector を共通化する。
- bell 用と page 用の差分だけを残す notification view model を設計する。
- `notification-subscription.ts` が不要なら削除し、必要なら実体責務を移す。

完了条件:

- `src/web/routes/notifications/+page.svelte` と `src/lib/components/NotificationBell.svelte` が同じドメイン処理を二重に持たない。

### Phase 2: comments / profile page の view-model 化

目的:
残っている大きな orchestration component/page を解体する。

作業:

- `CommentList.svelte` から filter、seek follow、profile preload、reply state、reaction/delete action を view model へ寄せる。
- `CommentCard.svelte` / `CommentForm.svelte` / `CommentFilterBar.svelte` との境界を見直す。
- `profile/[id]/+page.svelte` から follows count、comments pagination、confirm action orchestration を view model へ寄せる。

完了条件:

- comments と profile page の state transition が component/page 本体に埋まらない。

### Phase 3: `shared` の実装反転

目的:
公開 API の背後にある実体 ownership を揃える。

作業:

- `shared/browser/profile.ts` の背後にある profile state 実装を整理し、`lib/stores/profile.svelte.ts` を interop に寄せる。
- `shared/browser/relays.ts` と `shared/nostr/relays-config.ts` の背後実装を整理し、relay status / relay fetch / default relay source を一貫させる。
- `shared/browser/player.ts` と `shared/browser/extension.ts` の API を固定し、transport 実装を shared 側へ寄せる。
- `lib/stores/extension.svelte.ts` に残る raw `message` / `postMessage` を縮退させる。

完了条件:

- `shared` が名前だけの façade ではなく、実装 ownership を持つ公開 API になる。

### Phase 4: pure helper / config の配置方針を確定する

目的:
残っている `$lib/nostr/*` 参照を無駄に追い回さない。

作業:

- `content-link`、`nip19-decode`、`DEFAULT_RELAYS` を pure/config helper として整理する。
- 残すなら「public helper」として明示し、shared へ寄せるならまとめて移す。
- stateful helper と pure helper の lint ルールを分ける。

完了条件:

- route / component に残る `$lib/nostr/*` が「例外」ではなく、意図された配置として説明できる。

### Phase 5: lint hardening と cleanup

目的:
再発防止と仕上げを行う。

作業:

- `shared` を経由しない stateful relative import を禁止する。
- outdated doc 参照や placeholder comment を整理する。
- 使われなくなった interop wrapper を削除する。
- lint を warning から error へ引き上げる。

完了条件:

- 公開 API と内部実装の境界が lint で守られる。

## 8. 新しい禁止事項

以後のリファクタリングでは、次を禁止する。

- `shared` を単なる re-export 置き場として増やし続けること
- page と component に同じ preload / selector / read-marking ロジックを重複実装すること
- stateful 実装を `lib/stores` に戻しながら `shared` を façade のまま残すこと
- placeholder module を責務不一致のまま放置すること

## 9. 検証方針

各フェーズで最低限以下を回す。

- `pnpm check`
- `pnpm lint`
- `pnpm test`

加えて、次の画面スモークを手動確認する。

- notifications page と bell: unread、既読化、target preview、profile 表示
- comments: filter、seek 追従、reply、reaction、delete、mute
- profile page: profile 読み込み、follows count、comments 追加読込、follow/unfollow、mute
- settings/relays: relay list 読込、defaults、保存、接続状態表示
- extension/player: 再生状態更新、seek 伝播、side panel 連携

## 10. 直近の着手順

直近の順序は次で固定する。

1. notifications page と `NotificationBell` の共通 loader / selector を作る。
2. `CommentList` と profile page の orchestration を view model 化する。
3. その後で `profile` / `relays` / `extension` / `player` の ownership を `shared` 側へ反転させる。
4. pure helper / config の公開位置を決める。
5. 最後に lint を締め、interop wrapper を削る。

この順序なら、先に UI 側の重複を潰し、その後で内部実装を安全に差し替えられる。
