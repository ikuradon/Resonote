# Resonote 公開境界完成計画書

作成日: 2026-03-20

## 1. この文書の位置づけ

`docs/refactoring-plan-convergence.md` では、route を `$shared/browser` 側へ寄せ、責務収束を進める方針を定義した。2026-03-20 時点の実装確認では、その移行はかなり進んでいる。

今回の結論は明確である。次にやるべきことは route の import 置換ではない。`$shared` を公開境界として本物にし、その裏にまだ残っている `lib/stores` / `lib/nostr` の実体責務を移し切ることだ。

本書は、そのための「公開境界完成フェーズ」の計画書である。

## 2. 現在の実装状況

### 2.1 前進した点

- `pnpm check` は通過している。
- `pnpm lint` も通過している。
- `notifications` / `profile` / `bookmarks` / `settings` / `layout` / content page の多くが、`$lib/stores/*` 直参照から `$shared/browser/*` 参照へ切り替わっている。
- `src/app/bootstrap/init-app.ts` と `src/app/bootstrap/init-session.ts` により、初期化責務の見通しは前より良くなっている。
- route 直下の `$lib/stores/*` 依存は、ほぼ `locale` と `dev-tools` 相当まで縮小した。
- `notifications` の購読・既読・filter 基盤は `src/features/notifications/ui/notifications-view-model.svelte.ts` に移っている。

### 2.2 まだ未完了の点

- `src/shared/browser/profile.ts` は、依然として `src/lib/stores/profile.svelte.ts` の re-export である。
- `src/shared/browser/relays.ts` も、依然として `src/lib/stores/relays.svelte.ts` の re-export である。
- `src/shared/browser/player.ts`、`src/shared/browser/extension.ts`、`src/shared/browser/auth.ts`、`src/shared/browser/follows.ts`、`src/shared/browser/mute.ts`、`src/shared/browser/bookmarks.ts` も、公開境界というより alias 層に留まっている。
- `src/shared/nostr/gateway.ts` と `src/shared/nostr/cached-query.ts` も、契約名はあるが中身は re-export 中心である。
- `src/web/routes/notifications/+page.svelte` は、notification page model をまだ route 内に持っている。
- `src/web/routes/profile/[id]/+page.svelte` は、pubkey 解決、follow count、comment pagination、confirm action などの orchestration を route 側で持っている。
- `src/web/routes/settings/RelaySettings.svelte` は、`cached latest` 取得と default relay 決定を still route 主導で扱っている。
- `src/web/routes/[nip19]/+page.svelte` は、event fetch 以外の decode / path 解決を route 側で抱えている。
- `src/lib/stores/extension.svelte.ts` と `src/lib/components/NiconicoEmbed.svelte` には、raw `message` / `postMessage` が残っている。
- `src/lib/components/AudioEmbed.svelte` には、まだ `$lib/stores/player.svelte.ts` 直接依存が残っている。

## 3. 今回の判断

次段階の完全リファクタリング方針は、次の一文に要約できる。

> これ以降は `route の表面整理` より `公開境界の実体化` を優先する。`$shared/browser` と `$shared/nostr` を最終公開面として確定し、その背後の stateful 実装を `lib/stores` / `lib/nostr` から退かせる。

重要なのは、すべての `$lib/*` を無差別に追い出すことではない。優先対象は「状態を持つもの」「購読するもの」「外部 I/O を持つもの」である。`locale`、`toast`、`dev-tools` のような UI 補助は主戦場ではない。

## 4. 新しい設計原則

### 4.1 公開境界の定義

- route / layout / component が依存してよい stateful 境界は、原則として `$shared/browser/*` と `$features/*` のみとする。
- Nostr の stateful query / cache / relay access は、原則として `$shared/nostr/*` または feature/application を通す。
- `lib/stores` / `lib/nostr` は、最終的に内部実装か interop wrapper に限定する。

### 4.2 alias 層の扱い

- `shared` に re-export だけの module を置くこと自体は一時的に許容する。
- ただし、その先の target は同じフェーズ内で縮退対象でなければならない。
- 恒久的に「名前だけ shared、実体は legacy store」という構造は認めない。

### 4.3 優先順位の付け方

- 優先するのは、複数ページをまたぐ stateful 実装である。
- 具体的には `profile`、`relays`、`player`、`extension`、`notifications page model` を先に片付ける。
- `locale`、`toast`、`dev-tools` のような UI 補助は、最後まで残っても構わない。

### 4.4 route に残してよいもの

- タブ選択、dialog 開閉、hover、ローカル表示件数のような純 UI 状態は route / component に残してよい。
- query 実行順序、subscription 開始、cursor pagination、preview preload、parent/iframe transport は route に残さない。

## 5. いまの完了条件

次段階を完了とみなす条件は次のとおり。

1. `shared/browser/profile.ts` と `shared/browser/relays.ts` が、重い legacy store の単純 re-export ではなくなる。
2. `notifications` page と `profile` page の主要 orchestration が page model または feature/application に移る。
3. route / component からの stateful `$lib/nostr/*` 依存が消える。
4. `player` / `extension` transport が `shared/browser` 側へ閉じる。
5. `lib/stores` / `lib/nostr` に残るものが、interop wrapper か UI 補助であると説明できる。
6. lint が、この境界を継続的に守れる。

## 6. 優先順位

優先順位は次で固定する。

1. `profile` / `relays` の read-side 実体移管
2. `notifications` / `profile` page model 化
3. `player` / `extension` / embed transport 整理
4. stateful `$lib/nostr/*` helper の公開境界移設
5. lint hardening
6. legacy cleanup

前回までより優先順位が変わっている。`notifications` の基盤は前進したので、今は `profile` と `relays` のような shared の裏側に残っている重い実体を先に崩したほうが、全体に効く。

## 7. 実行フェーズ

### Phase 0: 公開面と内部実装の再分類

目的:
何を移すべきで、何を最後まで残してよいかを明確にする。

作業:

- `shared/browser` と `shared/nostr` を「公開面」として扱う前提を明文化する。
- `lib/stores` / `lib/nostr` のうち、stateful 実装と UI 補助を分けて扱う。
- UI 補助として当面据え置く候補を明示する。
  - `locale`
  - `toast`
  - `dev-tools`
- lint ルール追加時の allowlist を、この分類に合わせて設計する。

完了条件:

- 「全部移す」ではなく「優先して移す対象」がコード上の実態に沿って定義される。

### Phase 1: profile / relays の実体移管

目的:
`shared/browser/profile.ts` と `shared/browser/relays.ts` の裏にある legacy 実装を薄くする。

作業:

- `src/lib/stores/profile.svelte.ts` が持っている cache restore、batch fetch、NIP-05 補助、in-memory cache を feature または shared 側へ移す。
- `src/lib/stores/relays.svelte.ts` が持っている relay status / relay list fetch / refresh の実体を shared または feature/application に寄せる。
- `src/web/routes/settings/RelaySettings.svelte` が使う latest relay list query と default relay source を、route 直参照ではなく shared / feature へ移す。
- その後で `shared/browser/profile.ts` と `shared/browser/relays.ts` の target を差し替える。

完了条件:

- profile / relays が `shared` の裏側で完結する。
- legacy store は facade か interop まで縮退する。

### Phase 2: notifications / profile の page model 化

目的:
主要ページから orchestration を抜く。

作業:

- `src/web/routes/notifications/+page.svelte` に残る filter、pagination、target text preload、visible profile preload を feature/ui の page model へ寄せる。
- `src/web/routes/profile/[id]/+page.svelte` に残る decode 後の初期化、follows count 取得、comments pagination、confirm action orchestration を page model へ寄せる。
- `ProfileHeader.svelte` の follows list preload も、route か page model 側へ寄せ、header 自体は presentational に近づける。

完了条件:

- notifications route と profile route が、画面構成と純 UI 状態に集中する。

### Phase 3: player / extension / embed transport の最終整理

目的:
browser transport と再生連携を `shared/browser` に集約する。

作業:

- `src/shared/browser/player.ts` を単なる re-export ではなく、player の公開 API 面として固定する。
- `src/shared/browser/extension.ts` を `message` / `postMessage` transport の唯一の入口にする。
- `src/lib/components/AudioEmbed.svelte` の `$lib/stores/player.svelte.ts` 依存を除去する。
- `src/lib/components/NiconicoEmbed.svelte` の raw `message` / `postMessage` を shared 側 protocol に寄せる。

完了条件:

- player / extension 連携の transport 実装が複数箇所に散らない。

### Phase 4: stateful `$lib/nostr/*` の公開境界移設

目的:
route からの stateful Nostr helper 直参照を止める。

作業:

- `cachedFetchById` / `useCachedLatest` のような stateful helper は `shared/nostr` の公開面へ寄せる。
- `fetchProfileComments` は `features/profiles` 側の正式入口へ寄せ、route から `$lib/nostr/profile-queries.js` を見せない。
- relay defaults / relay event kind のような設定寄り定数も、route 直参照を避ける形へ整理する。
- `decodeNip19` / `content-link` のような pure helper は、最後に一貫性のため移すか据え置くかを判断する。

完了条件:

- route / component が stateful `$lib/nostr/*` を読まない。
- 純粋関数だけが例外として残るなら、その理由を説明できる。

### Phase 5: lint hardening

目的:
再発防止の自動化を行う。

作業:

- `src/web/routes/**/*.svelte` からの stateful `$lib/nostr/*` 依存を禁止する。
- `src/lib/components/**/*.svelte` からの `$lib/stores/player.svelte.ts` / `$lib/stores/extension.svelte.ts` 依存を禁止する。
- 必要なら `locale` / `toast` / `dev-tools` の allowlist を限定的に設ける。
- `shared` から `lib` への依存も、恒久 alias とならないよう対象を絞る。

完了条件:

- 今後 route / component / shared で境界が戻らない。

### Phase 6: cleanup

目的:
移行後の名前と責務を整える。

作業:

- 使われなくなった `lib/stores` / `lib/nostr` の wrapper を削除する。
- 残す wrapper は `interop` 相当であることが読める状態にする。
- docs の最新版を一本化し、古いフェーズ名との齟齬をなくす。

完了条件:

- 「shared が公開面、lib が内部実装」という構図が名前でも伝わる。

## 8. 新しい禁止事項

以後のリファクタリングでは、次を禁止する。

- `shared/browser` に新しい永久 re-export module を増やすこと
- route に stateful preload / pagination / fetch orchestration を追加すること
- `player` / `extension` の transport を component 側へ戻すこと
- `lib/stores` / `lib/nostr` を再び公開 API として使い始めること

## 9. 検証方針

各フェーズで最低限以下を回す。

- `pnpm check`
- `pnpm lint`
- `pnpm test`

加えて、次の画面スモークを手動確認する。

- profile: profile 読み込み、follow/unfollow、mute、comments 追加読込
- notifications: 一覧表示、filter、既読化、対象コメント表示
- settings: relay 読込、初期 relay セットアップ、relay 保存
- bookmarks: 一覧表示、削除
- player / extension: 再生、seek、埋め込み連携、side panel 連携

## 10. 直近の着手順

直近の順序は次で固定する。

1. `profile` と `relays` の read-side 実体を `shared` の裏に移す。
2. `notifications` と `profile` の page model を作って route を薄くする。
3. `player` / `extension` / embed transport を shared protocol に寄せる。
4. その後で stateful `$lib/nostr/*` を route から外す。
5. 最後に lint を締め、legacy wrapper を削る。

この順序なら、いま残っている「shared の裏に潜んだ旧実装」を先に崩し、そのあとで route を薄くし、最後に境界を固定できる。
