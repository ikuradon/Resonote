# Auftakt Monorepo Package Design

**Date:** 2026-04-08
**Status:** Approved

---

## 概要

`rx-nostr + 自作キャッシュ層` を完全置換するための `auftakt` を、最初から外部公開可能な品質で設計する。
ただし実装は Resonote モノレポ内で進め、`packages/auftakt` を本体、`packages/auftakt-resonote` をアプリ固有 preset として分離する。

この設計の主眼は次の 4 点である。

- `auftakt` 本体を、Resonote 固有事情に引きずられない公開可能な package として成立させる
- NIP 準拠機能は `auftakt` 本体に built-in として同梱する
- built-in であっても、根本ロジック以外は registry/plugin 形式で実装する
- Resonote 固有機能は `packages/auftakt-resonote` に隔離し、アプリ側は bootstrap/wiring だけを残す

---

## 決定事項

| 項目               | 決定                                                      |
| ------------------ | --------------------------------------------------------- |
| 実装形態           | Resonote モノレポ内 package                               |
| 本体 package       | `packages/auftakt`                                        |
| アプリ固有 package | `packages/auftakt-resonote`                               |
| アプリ側責務       | bootstrap / session 初期化 / feature wiring のみ          |
| 移行方式           | Big Bang。一括置換を前提とし、旧新併存期間は設けない      |
| core 方針          | runtime/store/sync/relay/publish などの根本ロジックを保持 |
| built-in 方針      | NIP 準拠で再利用可能な機能を built-in として同梱          |
| built-in 実装形態  | 根本ロジック以外は registry/plugin 形式                   |
| Resonote 固有      | `packages/auftakt-resonote` に隔離                        |

---

## 非目的

- v1 で `apps/resonote` までアプリ全体を物理移動すること
- 初版で全 NIP を built-in として実装すること
- Resonote 固有 projection を `auftakt` 本体へ含めること
- 段階移行のための長期互換層を設計すること

---

## パッケージ構成

最終的なワークスペース構成は次を目標とする。

```text
/
  pnpm-workspace.yaml
  package.json
  packages/
    auftakt/
      package.json
      src/
        core/
        transport/
        sync/
        store/
        models/
        handles/
        registry/
        builtins/
        testing/
    auftakt-resonote/
      package.json
      src/
        preset/
        comments/
        content/
        projection/
  src/
    app/
    features/
    shared/
```

ただし v1 の移行では、既存 SvelteKit app はルート直下に残してよい。
先に `packages/auftakt` と `packages/auftakt-resonote` を workspace package として追加し、既存アプリがそれらを consume する形にする。

---

## `packages/auftakt` の責務

`packages/auftakt` は公開ライブラリ本体であり、次を責務とする。

- runtime lifecycle
- relay transport
- fetch/live subscription
- sync/backfill/resume/gap recovery
- store/memory cache/persistent store/tombstone/optimistic state
- `User`, `Event`, `Timeline`, `Session`, `NostrLink` の公開モデル
- registry 契約と built-in の登録
- NIP 準拠で再利用可能な built-in 機能

### `packages/auftakt` に含める built-in

初期対象は少なくとも次とする。

- profiles
- relays
- follows
- mute
- bookmarks
- emoji sets
- NIP-19 link resolution

### `packages/auftakt` に含めないもの

次は Resonote 固有として扱い、本体には含めない。

- comments の意味論
- content reference の独自解釈
- podcast / episode resolver
- Resonote 固有 projection
- アプリ固有 UI 都合の集約ロジック

---

## `packages/auftakt-resonote` の責務

`packages/auftakt-resonote` は Resonote 固有 preset package とする。

責務は次の通り。

- Resonote 向け preset の公開
- comments/reactions 周辺の意味論
- content resolver
- podcast / episode resolver
- Resonote 固有 projection
- Resonote 用 default policy の束ね

この package には bootstrap や app wiring は含めない。
あくまで「Resonote 向けに `auftakt` を拡張する package」とする。

---

## アプリ側に残す責務

既存アプリ側には次のみを残す。

- runtime の生成タイミング
- login/logout と `Session` 開閉
- feature ごとの handle/preset の接続
- Svelte state との橋渡し

つまり app 側は adapter package を持たず、利用コードだけを持つ。
これにより `auftakt-resonote` がアプリ実装詳細に引きずられることを防ぐ。

---

## Core と Built-in の境界

`auftakt` は plugin-first の思想を維持するが、標準機能を「外付け optional plugin」とは扱わない。
NIP 準拠で広く再利用可能な機能は built-in として同梱する。

ただし built-in であっても、すべてを core に焼き込まない。

### core 本体に固定するもの

- query 実行
- relay 接続管理
- backfill/live/resume/gap recovery
- store persistence
- consistency/tombstone/optimistic merge
- publish orchestration
- registry の型契約と lifecycle

### built-in として plugin 形式で実装するもの

- relation 定義
- projection 定義
- codec/link resolver
- visibility rule
- backfill preset
- NIP ごとのモデル解釈

この方針により、標準機能は本体品質で提供しつつ、差し替えや追加の余地を維持する。

---

## `models` と registry の依存方向

`User.profile` や `User.relays` のような表面 API は提供してよい。
ただし model 層が built-in 実装を直接 import してはならない。

内部では次のルールを守る。

- model は relation key を runtime registry に問い合わせる
- built-in は registry への標準登録物として同梱する
- 利用者は必要なら同名 relation を override できる

これにより built-in を含んでも plugin 機構を形骸化させない。

---

## Built-in 採用基準

「NIP 準拠なら何でも built-in」にはしない。
次の条件をすべて、またはほぼすべて満たすものを built-in 対象とする。

- wire/protocol レベルで標準化されている
- 複数アプリで再利用可能である
- 特定 UI や画面都合に依存しない
- Resonote 独自タグや独自 projection に依存しない
- runtime/store/sync の根本ロジックを増やさずに載せられる

上記を満たさないものは `packages/auftakt-resonote` または将来の別 package に置く。

---

## 公開 API 方針

公開 surface は `packages/auftakt` から一貫した形で出す。

- `createRuntime`
- signer exports
- `Session`
- `User`
- `Event`
- `Timeline`
- `NostrLink`
- built-in registration helpers

利用者が内部パス import を強いられないことを原則とする。
signer や built-in も、公開対象である限り root export から到達可能にする。

---

## 移行方針

移行は Big Bang を前提とする。
ただし作業順は次の 4 段階に分ける。

1. `packages/auftakt` を公開可能な package 境界で成立させる
2. `packages/auftakt-resonote` を作り、Resonote 固有意味論を移す
3. 既存アプリの bootstrap と feature wiring を新 package に一括接続する
4. `rx-nostr`, `event-db`, `cached-query`, 互換ラッパーを除去する

長期互換層は設けない。
必要な移行用コードが出る場合も、一時的な内部実装に留め、公開 API には混ぜない。

---

## テスト方針

`packages/auftakt` では次を必須にする。

- 公開 API 契約テスト
- runtime/store/sync/transport の単体テスト
- built-in の契約テスト
- persistent store の統合テスト

`packages/auftakt-resonote` では次を必須にする。

- preset 登録テスト
- comments/content resolver/projection の統合テスト

既存アプリでは次を維持する。

- feature 統合テスト
- E2E による主要 UX 検証

---

## リスクとガードレール

### リスク 1: built-in が肥大化して core と境界が曖昧になる

対策:

- built-in 採用基準を満たすものだけに限定する
- Resonote 固有解釈は `auftakt-resonote` に送る

### リスク 2: model が built-in 実装に密結合し plugin 機構が死ぬ

対策:

- model は registry key ベースで解決する
- built-in 直接 import を禁止する

### リスク 3: app 側に adapter ロジックが再肥大化する

対策:

- app 側責務を bootstrap/wiring に限定する
- query/sync/cache/publish ロジックをアプリへ戻さない

### リスク 4: モノレポ化自体が移行の主目的を妨げる

対策:

- v1 では package 追加を優先し、アプリ全体の物理移動は後回しにする
- package 境界の確立を先に終える

---

## 完成条件

v1 の完成条件は次の両立である。

- `packages/auftakt` が、公開可能な core/built-in package として一貫した API とテストを持つ
- Resonote の対象機能が、`rx-nostr + 自作キャッシュ層` なしで `auftakt` + `auftakt-resonote` により動作する

対象機能の初期スコープは次とする。

- comments
- profiles
- relays
- publish

この v1 完了後に、他機能を同じ境界原則で順次寄せる。
