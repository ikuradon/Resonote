# Resonote 実装反転計画書

作成日: 2026-03-20

## 1. この文書の位置づけ

`docs/refactoring-plan-api-hardening.md` では、`shared` を stable API として扱い、その背後の実装を反転させる方針を定義した。2026-03-20 時点の再確認では、その前提となる consumer 側の移行はかなり進んでいる。

今回の結論は次の一文に集約できる。

> 次段階の主戦場は `公開 API を増やすこと` ではなく、`既存の公開 API の背後にある実装 ownership を一致させること` である。

つまり、いま必要なのは import 整理の継続ではない。`$shared` が public、`$lib` が internal/interop になるように実装の所在を揃え、page/component に残っている重複 orchestration を吸収することである。

本書は、そのための「実装反転フェーズ」の計画書である。

## 2. 実装状況確認

### 2.1 検証状況

- `pnpm check` は通過している。
- `pnpm lint` は通過している。
- `pnpm test` は通過している。
  - 62 files / 864 tests passed

### 2.2 前進した点

- `src/lib/components/**` から browser/business store を直接読む経路は大幅に減っている。
- `player` / `profile` / `relays` / `auth` / `mute` / `notifications` の consumer は、ほぼ `$shared/browser/*` 経由へ寄っている。
- `notifications` の旧 store と `comments` の旧 store は、薄い wrapper になっている。
- `NotificationBell.svelte` も `cachedFetchById` を `$shared/nostr/cached-query.js` 経由に切り替えている。
- 旧 `notification-subscription.ts` のような責務不一致の placeholder は消えている。

### 2.3 まだ残っている主要問題

ただし、公開面と実装面はまだ一致していない。

- `src/shared/browser/auth.ts`
- `src/shared/browser/bookmarks.ts`
- `src/shared/browser/extension.ts`
- `src/shared/browser/follows.ts`
- `src/shared/browser/mute.ts`
- `src/shared/browser/player.ts`
- `src/shared/browser/profile.ts`
- `src/shared/browser/relays.ts`

これらの多くは、依然として `lib/stores` の re-export である。

同様に、

- `src/shared/nostr/cached-query.ts`
- `src/shared/nostr/events.ts`
- `src/shared/nostr/gateway.ts`
- `src/shared/nostr/relays-config.ts`

も、まだ `lib/nostr` からの re-export が中心である。

### 2.4 まだ internal 実装が残っている場所

次の実体は、まだ `lib` 側に残っている。

- `src/lib/stores/profile.svelte.ts`
  - profile cache
  - DB restore
  - relay fetch
  - NIP-05 verification
- `src/lib/stores/relays.svelte.ts`
  - relay status state
  - relay list fetch
  - fallback
  - refresh
- `src/lib/stores/extension.svelte.ts`
  - raw `message` / `postMessage` transport
- `src/lib/stores/player.svelte.ts`
  - player state
  - extension/seek bridge integration

### 2.5 まだ page/component に残っている orchestration

- `src/web/routes/notifications/+page.svelte` と `src/lib/components/NotificationBell.svelte` が、target comment preload、profile preload、mark-as-read を二重に持っている。
- `src/lib/components/CommentList.svelte` は、comments UI の最終責務塊として残っている。
- `src/web/routes/profile/[id]/+page.svelte` は、pubkey decode、follows count、comments pagination、confirm action を page 本体で持っている。
- `src/web/routes/settings/RelaySettings.svelte` は、relay defaults 適用と page-local relay edit state を route component で持っている。

### 2.6 残っている `$lib/nostr` 参照の意味

いま route / component に残る `$lib/nostr/*` 参照は少数であり、その多くは pure helper か config である。

- `content-link`
- `nip19-decode`
- `DEFAULT_RELAYS`

これは、stateful infra の逆流ではない。したがって次段階で優先すべきなのは、pure helper の移設ではなく、stateful ownership の整合である。

## 3. 今回の判断

次段階の完全リファクタリング方針は、次のとおり。

> `shared` を façade のまま残さない。公開 API ごとに ownership を明確化し、stateful 実装を `shared` / feature / app 側へ反転させる。同時に、notifications・comments・profile に残る重複 orchestration を集約する。

重要なのは、すべてを一気に移すことではない。次段では「実装の所在」と「UI ロジックの重複」という2つの未完を同時に潰す。

## 4. 新しい設計原則

### 4.1 `shared` の public / internal を分ける

- `shared/browser/*` と `shared/nostr/*` は public API とみなす。
- `shared/browser/stores.ts` のような bootstrap 補助は public API ではなく internal helper として扱う。
- public API にする module と internal helper にする moduleを明示的に分ける。

### 4.2 `lib` は最終的に interop か internal のみ

- `lib/stores/*` と `lib/nostr/*` に残る stateful 実装は、最終的に `shared` / feature / app に ownership を移す。
- 移せない場合は internal 実装として位置づけ、public import 先にはしない。
- wrapper を残すなら interop であることを明記する。

### 4.3 重複した UI orchestration は共通 view model に寄せる

- page と panel が似た preload / selector / read logic を持つなら、共通 view model または selector に寄せる。
- comment UI のように component 自体が orchestration を抱えすぎている場合は、presentational と coordinator を分ける。

### 4.4 pure helper は最後にまとめて扱う

- pure helper / config は、stateful ownership が揃うまでは追い込み対象にしない。
- ただし、最終的に public helper として残すか `shared` へ移すかの方針は決める。

## 5. 次段階の完了条件

1. `shared/browser/profile.ts`、`shared/browser/relays.ts`、`shared/browser/extension.ts`、`shared/browser/player.ts` の背後実装が façade 以上の意味を持つ。
2. `profile` と `relays` の主要 stateful ownership が `lib/stores` ではなく `shared` / feature / app 側で説明できる。
3. `NotificationBell` と notifications page の重複 preload/read logic が共通化される。
4. `CommentList` の orchestration が分解される。
5. `profile/[id]/+page.svelte` の orchestration が page model 相当へ寄る。
6. pure helper / config の public 位置ポリシーが決まる。
7. lint が public API bypass を継続的に防げる。

## 6. 優先順位

優先順位は次で固定する。

1. notifications と comments と profile page の重複 orchestration を集約する
2. `profile` / `relays` / `extension` / `player` の実装 ownership を反転させる
3. `shared` の public/internal 分類を明文化する
4. pure helper / config の配置ポリシーを決める
5. lint hardening
6. legacy cleanup

前回計画からの変更点は、`consumer 移行` を主戦場から外し、`実装反転` を主戦場に置いたことにある。

## 7. 実行フェーズ

### Phase 0: public/internal の分類を固定する

目的:
`shared` の全 module を同列に扱わない。

作業:

- public API にする `shared/browser/*` / `shared/nostr/*` を明示する。
- bootstrap 専用 helper は internal 扱いにする。
- interop wrapper と internal 実装を区別する命名またはコメントを入れる。

完了条件:

- 「どこに依存してよいか」と「どこが内部実装か」が読める。

### Phase 1: notifications の共通化

目的:
notifications page と bell に残る二重実装をなくす。

作業:

- target comment preload を共通化する。
- visible profile preload を共通化する。
- mark-as-read の扱いを共通化する。
- page 用と bell 用の差分だけを残す selector/view model を feature 側へ寄せる。

完了条件:

- notifications 関連の UI が同じロジックを二重に持たない。

### Phase 2: comments / profile page の分解

目的:
UI 層に残る大きな orchestration 塊を解体する。

作業:

- `CommentList.svelte` を coordinator/view model と presentational 群へ分ける。
- `profile/[id]/+page.svelte` の decode 後初期化、follows count、comments pagination、confirm action を view model 化する。
- `ProfileHeader.svelte` や `ProfileComments.svelte` には表示責務を寄せる。

完了条件:

- comments と profile page の state transition が page/component 本体に密集しない。

### Phase 3: `profile` / `relays` / `extension` / `player` の実装反転

目的:
`shared` の背後にある実体 ownership を揃える。

作業:

- `profile` state の ownership を `shared` / feature 側へ寄せる。
- `relays` state と relay fetch / defaults / status の ownership を整理する。
- `extension` transport を `shared/browser/extension.ts` 側へ寄せる。
- `player` state と seek/extension 連携の API を `shared/browser/player.ts` 側で固定する。

完了条件:

- `shared` が façade ではなく、実装 ownership を伴う API になる。

### Phase 4: pure helper / config の配置方針を確定する

目的:
残件を stateful なものと pure なものに分けて収束させる。

作業:

- `content-link`、`nip19-decode`、`DEFAULT_RELAYS` を pure/config helper として明示する。
- 残すなら public helper として扱い、移すなら `shared` へまとめて移す。
- lint ルールを stateful helper と pure helper で分ける。

完了条件:

- `$lib/nostr/*` の残件が例外ではなく意図された構造になる。

### Phase 5: lint hardening と cleanup

目的:
再発防止と仕上げを行う。

作業:

- public API を経由しない stateful relative import を禁止する。
- outdated doc 参照を更新する。
- 不要になった interop wrapper を削除する。
- warning を error へ引き上げる。

完了条件:

- 公開 API と内部実装の境界が lint で守られる。

## 8. 新しい禁止事項

以後のリファクタリングでは、次を禁止する。

- `shared` を説明だけの façade のまま放置すること
- page と component に同じ preload / selector / read logic を重複実装すること
- stateful 実装を `lib` に置いたまま public import 先だけ `shared` にすること
- pure helper の移設を優先して、stateful ownership の整理を後回しにすること

## 9. 検証方針

各フェーズで最低限以下を回す。

- `pnpm check`
- `pnpm lint`
- `pnpm test`

加えて、次の画面スモークを手動確認する。

- notifications page と bell: unread、既読化、target preview、profile 表示
- comments: filter、seek 連動、reply、reaction、delete、mute
- profile page: decode、profile 読み込み、follows count、comments 追加読込、follow/unfollow、mute
- settings/relays: relay list、defaults、保存、接続状態
- extension/player: 再生状態更新、seek 伝播、side panel 連携

## 10. 直近の着手順

1. notifications page と `NotificationBell` の共通 selector / loader を作る。
2. `CommentList` と profile page の orchestration を view model 化する。
3. その後で `profile` / `relays` / `extension` / `player` の実装 ownership を反転させる。
4. pure helper / config の公開位置を決める。
5. 最後に lint を締め、interop wrapper を削る。

この順序なら、先に UI 側の重複を潰し、そのあとで `shared` の背後実装を安全に差し替えられる。
