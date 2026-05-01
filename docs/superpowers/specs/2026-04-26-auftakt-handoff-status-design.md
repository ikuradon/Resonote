# Auftakt Handoff Status Design

Date: 2026-04-26
Branch: `feat/auftakt`

## Summary

この設計は、`2026-04-25-auftakt-handoff-roadmap-design.md` の後続
HANDOFF を、2026-04-26 時点の実作業状況に合わせて再整理する。

元の roadmap は「残り wave の順序」を定義した文書だった。その後、
relay lifecycle policy と relay selection/outbox routing は focused design
や implementation plan へ進んでいる。したがって、この HANDOFF では同じ
wave を再計画しない。既に covered / in flight の作業は既存文書へ委譲し、
まだ focused design が必要な残作業だけを次の入口として明示する。

この文書の目的は実装計画ではない。次に作るべき focused design と、その
境界条件を明確にすることが目的である。

## Current Status

この文書での status は次の意味で使う。

- `Covered`: focused design または implementation plan が既にあり、この HANDOFF
  では再計画しない。
- `In Flight`: focused design / plan に加えて、直近 commit または completion plan で
  実装進行中と判断できる。
- `Remaining`: まだ個別 focused design が必要である。

### Covered: Strict Coordinator Surface

Strict coordinator surface は
`2026-04-25-auftakt-strict-coordinator-surface-design.md` で設計済みである。
app-facing reads, subscriptions, publish, repair, materialization は
coordinator-owned surface を通る前提になっている。

この HANDOFF では strict coordinator surface を再設計しない。残作業はすべて
この surface の上に積む。

### Covered: Relay Capability Queue

Relay capability queue は
`2026-04-25-auftakt-relay-capability-queue-design.md` と
`2026-04-25-auftakt-relay-capability-queue.md` で別途扱われている。

この作業は NIP-11 success / failure cache、learned safety bounds、
`max_filters` / `max_subscriptions` enforcement、queue state observation、
normalized capability snapshots を担当する。HANDOFF 残作業は raw NIP-11
document や raw relay session を公開してはならない。

### Covered: Relay Lifecycle Policy

Relay lifecycle policy は
`2026-04-25-auftakt-relay-lifecycle-policy.md` に implementation plan がある。

この wave の責務は default relay の lazy-keep、temporary relay の idle
disconnect、bounded reconnect/backoff、normalized relay status observation で
ある。entity handles や NIP automation はこの lifecycle policy を前提にし、
接続 lifecycle を再定義しない。

### In Flight: Relay Selection And Outbox Routing

Relay selection and outbox routing は
`2026-04-26-auftakt-relay-selection-outbox-routing-design.md` で設計済みで、
`2026-04-26-auftakt-relay-selection-completion-design.md` と
`2026-04-26-auftakt-relay-selection-completion.md` が completion work を扱う。

直近の作業では、core の pure planner、Resonote coordinator-owned policy、
by-id relay hint routing、publish/reply/reaction/mention routing、safe manual
routing escape hatch が進んでいる。この HANDOFF では selection policy を
再設計しない。残作業は completion plan の verification が終わった状態を前提に
進める。

## Handoff Boundaries

残り HANDOFF 作業は、次の公開 surface を増やしてはならない。

- raw relay session
- raw WebSocket packet
- raw Dexie handle
- raw Dexie row
- materializer queue
- plugin registry internals
- raw NIP-11 document
- mutable routing index

公開 API は coordinator-mediated な high-level state だけを返す。relay から来た
candidate event は validation、quarantine-on-failure、materialization、
visibility filtering を通過してから consumer に届く。

Feature code と plugin code は relay fan-out plan を直接組み立てない。必要な
場合は `@auftakt/core` の pure planner など safe public surface を使う。

## Remaining Focused Designs

### 1. Auftakt Entity Handles

次の runtime-focused design は Entity Handles とする。

候補 handle は以下である。

- `event(id)`
- `profile(pubkey)`
- `addressable(coord)`
- `relaySet(subject)`
- `relayHints(eventId)`

Handles は NDK-like な ergonomic API だが、strict coordinator surface を弱めては
ならない。handle methods は coordinator reads、subscriptions、publishes、
repairs、read models へ委譲する薄い API object として設計する。

Handle が返す状態は high-level settlement / read-model state に限定する。
deleted、missing、local、partial、repaired、relay-confirmed などの状態は表現して
よいが、Dexie row、relay packet、transport subscription id、materializer queue は
露出しない。

Entity Handles design は relay selection completion の後に作る。handles は
caller-built relay fan-out ではなく、coordinator-owned relay selection policy を
使う必要があるためである。

### 2. NIP Inventory Refresh Automation

次の maintenance-focused design は NIP Inventory Refresh Automation とする。

既存の土台は以下である。

- `docs/auftakt/nips-inventory.json`
- `docs/auftakt/nip-matrix.json`
- `scripts/check-auftakt-nips.ts`
- `scripts/check-auftakt-nips.test.ts`
- `docs/auftakt/status-verification.md`

Automation は official inventory drift、matrix owner gap、support boundary gap、
proof command gap、README/status docs drift を検出する。

ただし support status の自動昇格はしない。新しい official NIP が見つかった場合や
local matrix の support state を変更する場合は、人間の review を必要とする。

Network fetch failure は local docs を書き換える理由にならない。通常 check では
failure として報告し、test では fixture mode で deterministic に扱う。

## Execution Order

推奨順序は次の通り。

1. Relay selection completion の verification を閉じる。
2. Entity Handles の focused design を作る。
3. Entity Handles の implementation plan を作る。
4. NIP Inventory Refresh Automation の focused design を作る。
5. NIP Inventory Refresh Automation の implementation plan を作る。

NIP Inventory Refresh Automation は runtime policy から独立しているため、並行作業は
可能である。ただし runtime handoff の blocker にはしない。

Entity Handles は relay selection completion の後に置く。handles が先に入ると、
古い routing assumption を app-facing API に固定する危険がある。

## Error Handling

Status が既存文書間で競合する場合は、より新しい focused design / plan を正とする。
ただし verification proof がない wave は closed と扱わない。

Covered / in flight wave に残作業が見つかった場合は、この HANDOFF に実装手順を
追記しない。該当する focused design / completion plan を更新する。

Entity Handles は storage miss、relay miss、deletion visibility、partial settlement
を handle-level state に変換する。consumer は raw storage や raw relay packet を
inspect しなくてよい。

NIP Inventory Refresh Automation は official fetch failure を docs rewrite ではなく
check failure として扱う。

## Verification Gate

残り focused work は、各 wave の focused tests に加えて次を完了条件に含める。

```bash
pnpm run test:auftakt:core
pnpm run test:auftakt:storage
pnpm run test:auftakt:resonote
pnpm run check:auftakt:strict-closure
pnpm run check:auftakt-migration -- --proof
```

Entity Handles では追加で以下を確認する。

- facade interop tests
- handle settlement state tests
- deletion / missing / partial / repaired state tests
- package-root closure tests
- plugin isolation tests

NIP Inventory Refresh Automation では追加で以下を確認する。

- official inventory fixture tests
- matrix drift tests
- owner / support boundary / proof gap tests
- docs sync tests
- network failure does not rewrite docs

## Acceptance Criteria

- 元の handoff roadmap を再計画せず、2026-04-26 時点の status-first HANDOFF に
  整理されている。
- strict coordinator surface、relay capability queue、relay lifecycle policy、
  relay selection/outbox routing は既存 focused design / plan に委譲されている。
- 残り focused design は Entity Handles と NIP Inventory Refresh Automation に
  限定されている。
- Entity Handles は relay selection completion の後に置かれている。
- NIP Inventory Refresh Automation は runtime policy blocker ではなく、独立した
  maintenance work として扱われている。
- raw relay、raw storage、materializer queue、raw NIP-11 document を公開しない
  境界条件が明記されている。
- 次の implementation planning に進むための verification gate が明記されている。
