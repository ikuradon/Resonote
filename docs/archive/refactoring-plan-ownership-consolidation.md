# Resonote Ownership Consolidation 計画書

作成日: 2026-03-21

## 1. この文書の位置づけ

`docs/refactoring-plan-implementation-inversion.md` では、`shared` の背後にある実装 ownership を `lib` から反転させる方針を定義した。2026-03-21 時点の実装確認では、その前提となる consumer 側の移行はほぼ完了に近い。

今回の結論は次の一文に要約できる。

> 次段階の完全リファクタリングは、`新しい境界を増やすこと` ではなく、`残っている ownership の曖昧さを消すこと` である。

つまり、いま必要なのは「どこから import するか」の議論より、「その実装を誰が所有するか」を収束させることだ。

本書は、そのための「ownership consolidation フェーズ」の計画書である。

## 2. 現在の実装状況

### 2.1 検証状況

- `pnpm check` は通過している。
- `pnpm lint` は通過している。
- `pnpm test` は通過している。
  - 62 files / 864 tests passed

### 2.2 進捗として評価できる点

- `player` / `profile` / `relays` / `auth` / `mute` / `notifications` の consumer は、ほぼ `$shared/browser/*` 経由へ寄っている。
- `NotificationBell.svelte` も `cachedFetchById` を `$shared/nostr/cached-query.js` 経由に切り替えている。
- browser/business store を直接読む relative import は、表示層ではほぼ解消されている。
- `src/lib/components/**` に残る `../stores/*.svelte.js` 依存は 7 ファイルまで縮小している。
- その 7 ファイルは、comments wrapper か UI-support store に偏っている。
  - `comments.svelte`
  - `toast.svelte`
  - `emoji-sets.svelte`
  - `emoji-mart-preload.svelte`
  - `locale.svelte`

### 2.3 依然として未完了の点

consumer 側はかなり整理されたが、ownership はまだ揃っていない。

- `src/shared/browser/*.ts` の多くは、まだ `lib/stores` の re-export である。
- `src/shared/nostr/*.ts` の多くは、まだ `lib/nostr` の re-export である。
- `src/lib/stores/profile.svelte.ts` は、依然として profile の stateful 実装本体である。
- `src/lib/stores/relays.svelte.ts` は、依然として relay status / relay fetch / fallback の実装本体である。
- `src/lib/stores/extension.svelte.ts` は、依然として raw transport の実装本体である。
- `src/lib/stores/player.svelte.ts` は、依然として player state の実装本体である。

### 2.4 まだ UI 層に残る責務塊

- `src/web/routes/notifications/+page.svelte` と `src/lib/components/NotificationBell.svelte` は、target comment preload / profile preload / read logic をまだ二重に持っている。
- `src/lib/components/CommentList.svelte` は、comments UI の coordinator として残っている。
- `src/web/routes/profile/[id]/+page.svelte` は、decode 後初期化、follows count、comments pagination、confirm action を page 本体で持っている。
- `src/web/routes/settings/RelaySettings.svelte` は、relay defaults と page-local relay editor を route component で持っている。

### 2.5 いま残っている `$lib` 参照の性質

残件の性質はかなり明確になっている。

- stateful なものの大半は、もう consumer から直接読まれていない
- 残っている `$lib` 参照の多くは、UI-support store か pure helper / config である

したがって、次段階の優先順位は「pure helper を消す」ではなく「stateful ownership を shared 側へ確定する」に置くべきである。

## 3. 今回の判断

次段階の完全リファクタリング方針は、次のとおり。

> `shared` を public API、`lib` を internal/interop として最終収束させる。その際、notifications / comments / profile / relays に残る coordinator ロジックを feature/shared に寄せ、stateful 実装の ownership を一本化する。

ここで重要なのは、「移すこと」そのものより「最終的にどこが owner か」を明示することである。owner が曖昧なまま façade だけを増やすのは、完全リファクタリングではない。

## 4. 新しい設計原則

### 4.1 モジュールを 4 種類に分ける

以後、対象 module は次の4種類で扱う。

1. `public API`
   - route/component/feature/app が依存してよい入口
   - 例: `shared/browser/*`, `shared/nostr/*`
2. `internal implementation`
   - public からのみ使われる内部実装
3. `interop wrapper`
   - 移行期間の後方互換専用
4. `pure helper / UI-support`
   - pure helper、locale、toast、emoji preload など

この分類を曖昧にしない。

### 4.2 `shared/browser/stores.ts` は public API にしない

- `shared/browser/stores.ts` は bootstrap 補助であり、public API として増殖させない。
- app/bootstrap など限定用途の internal helper として扱う。

### 4.3 `lib` に stateful owner を残すなら理由を書く

- `lib/stores/profile.svelte.ts`
- `lib/stores/relays.svelte.ts`
- `lib/stores/player.svelte.ts`
- `lib/stores/extension.svelte.ts`

これらに stateful 実装を残すなら、temporary internal なのか interop なのかを明記する。理由のない滞留は認めない。

### 4.4 UI の二重実装を放置しない

- page と component が同じ preload / selector / read logic を持つなら、共通 coordinator/view model を作る。
- comments のように component が coordinator 化している場合は、presentational と coordinator を分ける。

## 5. 次段階の完了条件

1. `profile` / `relays` / `player` / `extension` の stateful ownership が `shared` / feature / app 側で説明できる。
2. `shared/browser/*` と `shared/nostr/*` の各 module が `public API` か `internal helper` か明示される。
3. `NotificationBell` と notifications page の重複 loader/selector が共通化される。
4. `CommentList` の coordinator ロジックが分離される。
5. `profile/[id]/+page.svelte` の orchestration が page model 相当へ寄る。
6. `RelaySettings.svelte` の relay defaults / query ownership が整理される。
7. `lib/stores` / `lib/nostr` に残るものが `internal` か `interop` か説明できる。
8. lint がこの分類を守れる。

## 6. 優先順位

優先順位は次で固定する。

1. notifications / comments / profile / relays の coordinator 重複を集約する
2. `profile` / `relays` / `extension` / `player` の ownership を反転させる
3. `shared` の public/internal/interop/pure-helper 分類を固定する
4. lint hardening
5. legacy cleanup

前回計画からの変更点は、`実装反転` の方針をさらに狭め、`ownership consolidation` に焦点を絞った点にある。

## 7. 実行フェーズ

### Phase 0: 分類の固定

目的:
収束先を曖昧にしない。

作業:

- `shared/browser/*` と `shared/nostr/*` のうち public API にするものを固定する。
- `shared/browser/stores.ts` のような internal helper を明示する。
- `lib/stores/*` / `lib/nostr/*` のうち interop と internal を区別する。
- lint / comments / docs の表現をこの分類に合わせる。

完了条件:

- module ごとの立場が読める。

### Phase 1: notifications / comments / profile の coordinator 集約

目的:
UI 層に残る重複 orchestration をなくす。

作業:

- notifications page と `NotificationBell` の target comment preload / profile preload / read logic を共通化する。
- `CommentList.svelte` の coordinator 部分を分離する。
- `profile/[id]/+page.svelte` の decode、follows count、comments pagination、confirm action を page model 化する。

完了条件:

- page/component が同じロジックを二重に持たない。

### Phase 2: ownership inversion

目的:
stateful owner を `shared` / feature / app 側へ寄せる。

作業:

- `profile` state 実装の owner を整理する。
- `relays` state と defaults/query/status の owner を整理する。
- `extension` transport を `shared/browser/extension.ts` 側へ寄せる。
- `player` state と seek/extension 連携の API を `shared/browser/player.ts` 側で固定する。

完了条件:

- `shared` が façade ではなく owner を持つ API になる。

### Phase 3: pure helper / UI-support の位置決め

目的:
stateful でない残件を無理なく収束させる。

作業:

- `content-link`、`nip19-decode`、`DEFAULT_RELAYS` を pure/config helper として明示する。
- `locale`、`toast`、`emoji-sets`、`emoji-mart-preload` を UI-support として扱うか、さらに寄せるか判断する。
- stateful rule と pure-helper rule を lint で分ける。

完了条件:

- 残件が「例外」ではなく意図された配置になる。

### Phase 4: lint hardening と cleanup

目的:
収束後の逆流を止める。

作業:

- public API を経由しない stateful relative import を禁止する。
- outdated doc 参照を更新する。
- 不要になった interop wrapper を削除する。
- warning を error へ引き上げる。

完了条件:

- ownership 境界が lint で守られる。

## 8. 新しい禁止事項

以後のリファクタリングでは、次を禁止する。

- `shared` を public/internal の区別なしに増やし続けること
- stateful 実装を `lib` に残したまま public façade だけ増やすこと
- page と component に同じ preload / selector / read logic を重複実装すること
- pure helper の移設を優先して stateful owner の整理を後回しにすること

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

1. notifications page と `NotificationBell` の共通 coordinator を作る。
2. `CommentList` と profile page の orchestration を分離する。
3. その後で `profile` / `relays` / `extension` / `player` の owner を `shared` 側へ反転させる。
4. pure helper / UI-support の位置を決める。
5. 最後に lint を締め、interop wrapper を削る。

この順序なら、先に重複ロジックを潰し、そのあとで owner を安全に入れ替えられる。
