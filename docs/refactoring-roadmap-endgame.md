# リファクタリング終盤ロードマップ

更新日: 2026-03-21

## この文書の役割

この文書は、今回のリファクタリングで最終的に確定した構造と運用ルールを保持する基準文書です。
過去の `docs/archive/refactoring-plan*.md` は履歴として残しますが、今後の判断基準として更新するのはこの文書だけです。
`docs/archive/refactoring-plan*.md` は archive 扱いで、現行構造の正とはみなしません。

- 終着点をどこに置くか
- 長期的にどの順序で収束させるか
- 直近で何を片付けるか
- 何をもって完了とみなすか
- いまの進捗をどう管理するか

## 進捗管理ルール

### ステータス定義

- `planned`: 未着手
- `in_progress`: 着手中
- `blocked`: 前提不足または判断待ち
- `done`: 完了条件を満たした

### 更新ルール

1. 何か進めたら、最初に `進捗ダッシュボード` を更新する。
2. マイルストーンの意味が変わったら、その場で `短期マイルストーン` の説明とチェックリストも更新する。
3. `pnpm check` / `pnpm lint` / `pnpm test` を回したら、`チェックポイント` の状態も更新する。
4. 意味のある変更を入れたら、`進捗ログ` に 1 行追加する。
5. マイルストーンは、終了条件と関連チェックポイントの両方を満たすまで `done` にしない。

## 現在地

現時点で、今回の構造反転は完了しています。

- `src/shared/browser` / `src/shared/nostr` / `src/shared/content` / `src/shared/utils` が、共通 runtime ownership の中心になっている
- `src/features/*` が業務ロジック、アプリケーション処理、view-model を持つ構成へかなり寄っている
- `src/app/*` が app shell / bootstrap の責務を持つ構成へ寄っている
- `src/web/routes/*` は以前よりかなり薄くなっており、多くの route が feature/app view-model を呼ぶ facade に近づいている
- profile 表示ルールは `src/shared/browser/profile.ts` の helper に集約され、`CommentCard` / `ProfileHeader` / notifications / login / mute settings が同じ表示組み立てを使う状態になった
- `src/lib/content` / `src/lib/nostr` / `src/lib/utils` の runtime ownership は整理済み
- `src/lib/stores` の runtime ownership は除去済みで、directory 自体も空になっている
- 現在の検証状態は green
  - `pnpm check`
  - `pnpm lint`
  - `pnpm test`
  - 現在の基準値: `79` files / `898` tests passed

## 進捗ダッシュボード

### Horizon ボード

| Horizon                   | Status | 現状                                                                                                                                                                                                       | 次にやること                             |
| ------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Horizon 1: 表層責務の収束 | `done` | route / component の大半は薄くなり、settings / notifications / comment/profile presentation の主残件は片付いた。残る hit は thin facade の confirm binding と低優先度 UI infrastructure だけになっている。 | 完了。                                   |
| Horizon 2: 境界の固定     | `done` | lint と ownership は固まり、残置パスも意図的なものだけに絞れた。README / CLAUDE / 本文書も同じ構造認識に揃った。                                                                                           | 完了。                                   |
| Horizon 3: 収束完了と凍結 | `done` | stop condition を満たし、今後はこの構造を前提に通常開発へ戻せる状態になった。                                                                                                                              | 完了。以後は通常開発または個別 cleanup。 |

### マイルストーンボード

| マイルストーン                                      | Status | 完了条件の要約                                                                                  | 次アクション                                          |
| --------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Milestone 1: Settings Surface Cleanup               | `done` | `MuteSettings` が confirm orchestration を持たない。                                            | 完了。次は notifications surface を収束させる。       |
| Milestone 2: Notifications Surface Convergence      | `done` | notifications page と bell が同じ display-facing helper を使う。                                | 完了。次は `CommentCard` と profile display cleanup。 |
| Milestone 3: Comment / Profile Presentation Cleanup | `done` | `CommentCard` が presentation-first になり、profile 表示ルールが shared helper に収束している。 | 完了。次は policy / docs freeze。                     |
| Milestone 4: Policy / Docs Freeze                   | `done` | active docs が最終構造と一致し、stop condition が完了している。                                 | 完了。                                                |

### チェックポイントボード

| チェックポイント                                  | Status | 最終確認日 | メモ                                                                                                                                                           |
| ------------------------------------------------- | ------ | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Checkpoint A: 検証ベースライン                    | `done` | 2026-03-21 | `pnpm check` / `pnpm lint` / `pnpm test` 通過済み。現基準値は `79` files / `898` tests passed。                                                                |
| Checkpoint B: legacy runtime ownership 不増       | `done` | 2026-03-21 | `src/lib/nostr` / `src/lib/content` / `src/lib/utils` へ business/runtime が戻っていない。                                                                     |
| Checkpoint C: `lib/stores` runtime ownership 除去 | `done` | 2026-03-21 | UI-support owner も `shared/browser` / `shared/i18n` へ移した。                                                                                                |
| Checkpoint D: route / component hotspot 縮小      | `done` | 2026-03-21 | `CommentCard` / `ProfileHeader` の profile display は shared helper へ収束した。残る hit は thin facade の confirm binding と低優先度 UI infrastructure のみ。 |
| Checkpoint E: public bridge 優先                  | `done` | 2026-03-21 | direct store 利用は意図的な UI-support にほぼ限定されている。                                                                                                  |

## 終着点

このリファクタリングの終着点は、次の状態です。

### 1. runtime ownership が `shared` / `features` / `app` に収束している

- `src/shared/*` が cross-feature な公開 runtime boundary になっている
- `src/features/*` が業務ルール、アプリケーション処理、feature 向け view-model を持っている
- `src/app/*` が shell / bootstrap のみを持っている
- `src/web/routes/*` は facade か、それに近い薄い層になっている
- `src/lib/*` は presentation と component-local helper のみになっている

### 2. `lib` に business logic が戻らない

- `src/lib` に runtime ownership を戻さない
- `src/lib/nostr` / `src/lib/content` / `src/lib/utils` に ownership を戻さない
- route や component に「UIだから」という理由で orchestration を戻さない

### 3. public API の使い方が自然に固定されている

- consumer は `$shared/browser/*` / `$shared/nostr/*` / `$shared/content/*` を使う
- `*.svelte.ts` の内部実装を直接 import しない
- `$lib` 直参照は presentation helper 以外では増えない

### 4. 文書と実装が一致している

- この文書
- `README.md`
- `CLAUDE.md`

上記 3 つが同じ構造認識を持っている

### 5. 完了判定

次をすべて満たした時点で、リファクタリングは完了とみなします。

- 意味のある runtime ownership が `shared` / `features` / `app` の外に残っていない
- `lib` に残るコードが、見てすぐに presentation または component-local helper だと分かる
- 残る hotspot が「意図的残置」か「費用対効果の低い cleanup」だけになっている
- lint と運用ルールだけで構造を維持できる

この状態に達したら、以後の作業は「リファクタリング」ではなく通常の機能開発または個別 cleanup として扱います。

## Residual Zero Achieved

- runtime residual は 0
- `shared/browser` と `shared/i18n` が UI-support と i18n の公開面を持つ
- `src/lib/stores` は削除済み、`src/lib/i18n` の runtime も `shared/i18n` に統合済み
- 残る `src/lib/*` は presentation と component-local helper だけで説明できる

## Additional Hardening

### Structure Check

実行:

```bash
pnpm check
pnpm lint
pnpm test
pnpm check:structure
pnpm graph:imports:summary
pnpm perf:bundle:summary
rg -n '\$lib/stores/.*svelte|\.\./stores/.*svelte' src --glob '!**/*.test.*'
rg -n '\$lib/i18n/(t|locales)\.js|\.\./i18n/(t|locales)\.js' src --glob '!**/*.test.*'
```

固定化:

- `src/architecture/structure-guard.test.ts` が legacy store / i18n runtime import の再流入をテストで止める
- `eslint.config.js` が route / component / feature / app からの legacy path import を lint で止める
- `pnpm graph:imports` / `pnpm graph:imports:summary` が import graph の可視化に使える
- CI が import graph artifact を毎回保存する
- `pnpm perf:bundle` / `pnpm perf:bundle:summary` が bundle 変化の確認に使える
- CI が bundle profile artifact を毎回保存する

### Component-Local Helper Audit

棚卸し結果:

- [audio-embed-view-model.svelte.ts](/root/src/github.com/ikuradon/Resonote/src/lib/components/audio-embed-view-model.svelte.ts)
  - `AudioEmbed.svelte` 専用の DOM / media element orchestration なので component-local のままにする
- [comment-list-view-model.svelte.ts](/root/src/github.com/ikuradon/Resonote/src/lib/components/comment-list-view-model.svelte.ts)
  - `CommentList.svelte` 専用の rendering coordination なので component-local のままにする
- [emoji-popover-id.ts](/root/src/github.com/ikuradon/Resonote/src/lib/components/emoji-popover-id.ts)
  - browser/shared ownership を要しない presentation helper なので local に残す

関連テスト:

- [audio-embed-view-model.test.ts](/root/src/github.com/ikuradon/Resonote/src/lib/components/audio-embed-view-model.test.ts)
- [comment-list-view-model.test.ts](/root/src/github.com/ikuradon/Resonote/src/lib/components/comment-list-view-model.test.ts)

判断基準:

- shared / feature に上げるのは、複数の UI surface で再利用され、presentation を越えて ownership を持つものだけ
- DOM bind / render coordination / presentational ID helper は `src/lib/components` に残してよい

## Residual Zero Program

stop condition はすでに満たしていますが、「意図的 residual も 0 にする」なら別プログラムとして扱うのが安全です。
ここでの目的は構造の大枠を再設計することではなく、UI-support runtime ownership を `shared` へ完全に反転し、`lib` から stateful / state-reading residual を消し切ることです。

### Residual Zero の終着点

- `src/lib/stores/*.svelte.ts` が 0 件になる
- `src/lib/i18n/*` の runtime 資産が 0 件になり、翻訳 API と辞書は `src/shared/i18n/*` に統合される
- `EmojiPicker` / `EmojiPickerPopover` が `emoji-mart-preload` を直接 import しない
- `src/shared/browser/locale.ts` / `toast.ts` / `dev-tools.ts` が `lib/stores` re-export ではなく local owner を向く
- `rg -n '\$lib/stores/.*svelte|../stores/.*svelte' src --glob '!**/*.test.*'` の hit が 0 になる
- `src/architecture/structure-guard.test.ts` が zero-residual の境界を固定する

### Milestone ボード

| Milestone                                   | Status | 目的                                                                   | 主対象                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------- | ------ | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Residual 1: UI-Support Owner Inversion      | `done` | `locale` / `toast` / `dev-tools` の owner を `shared/browser` へ移した | [src/shared/browser/locale.ts](/root/src/github.com/ikuradon/Resonote/src/shared/browser/locale.ts), [src/shared/browser/toast.ts](/root/src/github.com/ikuradon/Resonote/src/shared/browser/toast.ts), [src/shared/browser/dev-tools.ts](/root/src/github.com/ikuradon/Resonote/src/shared/browser/dev-tools.ts)                                                       |
| Residual 2: Shared I18n Promotion           | `done` | `t()` と locale-aware translation API を `shared/i18n` へ昇格した      | [src/shared/i18n/t.ts](/root/src/github.com/ikuradon/Resonote/src/shared/i18n/t.ts)                                                                                                                                                                                                                                                                                     |
| Residual 3: Emoji-Mart Infra Promotion      | `done` | `emoji-mart` browser infra を `shared/browser` へ移した                | [src/shared/browser/emoji-mart.ts](/root/src/github.com/ikuradon/Resonote/src/shared/browser/emoji-mart.ts), [src/lib/components/EmojiPicker.svelte](/root/src/github.com/ikuradon/Resonote/src/lib/components/EmojiPicker.svelte), [src/lib/components/EmojiPickerPopover.svelte](/root/src/github.com/ikuradon/Resonote/src/lib/components/EmojiPickerPopover.svelte) |
| Residual 4: Interop Delete / Lint Hardening | `done` | `lib/stores` を削除し、再流入を lint で止めた                          | `src/lib/stores/*`, `eslint.config.js`                                                                                                                                                                                                                                                                                                                                  |
| Residual 5: Zero Residual Sweep             | `done` | grep / docs / tests を residual 0 基準へ更新した                       | `docs`, `README.md`, `CLAUDE.md`                                                                                                                                                                                                                                                                                                                                        |

### 実行順

1. `Residual 1` を先に行う
   - `shared/browser/*.ts` の re-export を local owner に変える
2. `Residual 2` を次に行う
   - `t()` の移設は参照箇所が多いので、bridge が整ったあとにまとめて行う
3. `Residual 3` を行う
   - `emoji-mart` は browser-only infra なので、`shared/browser` へ単独 ownership を立てる
4. `Residual 4` を実施する
   - interop file を消し、lint 例外を 0 にする
5. 最後に `Residual 5` を実施する
   - residual セクションを削除し、README / CLAUDE / 本文書を zero residual 前提に更新する

### Milestone 詳細

#### Residual 1: UI-Support Owner Inversion

目的:

- `locale` / `toast` / `dev-tools` を `shared/browser` 直下の stateful owner にする

タスク:

- [x] `src/shared/browser/locale.svelte.ts` を追加し、[src/lib/stores/locale.svelte.ts](/root/src/github.com/ikuradon/Resonote/src/lib/stores/locale.svelte.ts) の実装を移した
- [x] `src/shared/browser/toast.svelte.ts` を追加し、[src/lib/stores/toast.svelte.ts](/root/src/github.com/ikuradon/Resonote/src/lib/stores/toast.svelte.ts) の実装を移した
- [x] `src/shared/browser/dev-tools.svelte.ts` を追加し、[src/lib/stores/dev-tools.svelte.ts](/root/src/github.com/ikuradon/Resonote/src/lib/stores/dev-tools.svelte.ts) の実装を移した
- [x] [src/shared/browser/locale.ts](/root/src/github.com/ikuradon/Resonote/src/shared/browser/locale.ts), [src/shared/browser/toast.ts](/root/src/github.com/ikuradon/Resonote/src/shared/browser/toast.ts), [src/shared/browser/dev-tools.ts](/root/src/github.com/ikuradon/Resonote/src/shared/browser/dev-tools.ts) を local owner を向く形に変えた
- [x] 対応する test を `shared/browser` 側へ移した

完了条件:

- `src/shared/browser/{locale,toast,dev-tools}.ts` が `lib/stores` を import しない

#### Residual 2: Shared I18n Promotion

目的:

- `locale` を読む翻訳 API を `lib/i18n` から外し、`shared` の公開面として扱う

タスク:

- [x] `src/shared/i18n/t.ts` を追加し、[src/lib/i18n/t.ts](/root/src/github.com/ikuradon/Resonote/src/lib/i18n/t.ts) の runtime ownership を移した
- [x] `src/shared/i18n/locales.ts` と message JSON の置き場所を `shared/i18n` へ寄せた
- [x] route / component / feature / app の `t()` import を `$shared/i18n/t.js` へ揃えた
- [x] `lib/i18n/t.ts` を interop wrapper にせず削除した

完了条件:

- `rg -n 'i18n/t\\.js' src --glob '!src/shared/i18n/**' --glob '!**/*.test.*'` の hit が `$shared/i18n/t.js` だけになる

#### Residual 3: Emoji-Mart Infra Promotion

目的:

- `emoji-mart-preload` を browser infra として `shared/browser` に昇格する

タスク:

- [x] `src/shared/browser/emoji-mart.svelte.ts` と公開 entrypoint を追加した
- [x] [src/lib/stores/emoji-mart-preload.svelte.ts](/root/src/github.com/ikuradon/Resonote/src/lib/stores/emoji-mart-preload.svelte.ts) の IndexedDB cache / dynamic import / delayed cache write を移した
- [x] [src/lib/components/EmojiPicker.svelte](/root/src/github.com/ikuradon/Resonote/src/lib/components/EmojiPicker.svelte) と [src/lib/components/EmojiPickerPopover.svelte](/root/src/github.com/ikuradon/Resonote/src/lib/components/EmojiPickerPopover.svelte) を `$shared/browser/emoji-mart.js` と `$shared/i18n/t.js` に揃えた
- [x] cache hit / cache miss / preload idempotency / delayed cache write の test を追加した

完了条件:

- `rg -n 'emoji-mart-preload' src --glob '!**/*.test.*'` の hit が 0 になる

#### Residual 4: Interop Delete / Lint Hardening

目的:

- `lib/stores` を空にし、再発を lint で止める

タスク:

- [x] `src/lib/stores/locale.svelte.ts` / `toast.svelte.ts` / `dev-tools.svelte.ts` / `emoji-mart-preload.svelte.ts` を削除する
- [x] `src/lib/stores/` に残る test / import / docs 参照を掃除する
- [x] `eslint.config.js` を更新し、`$lib/stores/*.svelte` と `../stores/*.svelte` の例外を 0 にする
- [x] `rg -n '\$lib/stores/.*svelte|../stores/.*svelte' src --glob '!**/*.test.*'` を CI 相当のチェックポイントとして固定する

完了条件:

- non-test source からの `lib/stores` import が 0 件

#### Residual 5: Zero Residual Sweep

目的:

- docs と検証結果を zero residual 前提に揃える

タスク:

- [x] `pnpm check` / `pnpm lint` / `pnpm test` を再実行する
- [x] `README.md` / `CLAUDE.md` / 本文書から intentional residual 前提の記述を削除する
- [x] `最終 residual` セクションを削除し、代わりに `Residual Zero Achieved` の完了記録へ置き換える
- [x] 進捗ログに zero residual 完了を追記する

完了条件:

- 文書上の residual policy が「許容する residual」ではなく「残さない」に変わる

### Checkpoint

| Checkpoint            | Status | 判定条件                                                                            |
| --------------------- | ------ | ----------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Residual Checkpoint A | `done` | `shared/browser/*.ts` の `locale` / `toast` / `dev-tools` が re-export ではない     |
| Residual Checkpoint B | `done` | `t()` の import surface が `shared/i18n` に一本化されている                         |
| Residual Checkpoint C | `done` | `emoji-mart-preload` が source から消え、`EmojiPicker*` が shared bridge だけを見る |
| Residual Checkpoint D | `done` | `rg -n '\$lib/stores/.\*svelte                                                      | ../stores/._svelte' src --glob '!\*\*/_.test.\*'` が 0 件 |
| Residual Checkpoint E | `done` | `pnpm check` / `pnpm lint` / `pnpm test` が通り、文書から residual 記述が消えている |

## 完了後の局所クリーンアップ計画

stop condition はすでに満たしていますが、局所的な rough edge を可能な限り潰し切るなら、次の順序で進めるのが最短です。
ここでの目的は構造反転そのものではなく、thin facade / support helper / demo infrastructure に残っている局所的な揺れを整理することです。

### Cleanup Program ボード

| Workstream                                   | Status | 目的                                                                                       | 主対象                                                                                                                                                                                                                                                         |
| -------------------------------------------- | ------ | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cleanup 1: Thin Confirm Facade Removal       | `done` | route に残る `ConfirmDialog` prop shaping をゼロにした                                     | [src/web/routes/profile/[id]/+page.svelte](/root/src/github.com/ikuradon/Resonote/src/web/routes/profile/[id]/+page.svelte), [src/web/routes/settings/MuteSettings.svelte](/root/src/github.com/ikuradon/Resonote/src/web/routes/settings/MuteSettings.svelte) |
| Cleanup 2: Dev Tools Bridge化                | `done` | settings route から direct `dev-tools` store import を外した                               | [src/web/routes/settings/DeveloperTools.svelte](/root/src/github.com/ikuradon/Resonote/src/web/routes/settings/DeveloperTools.svelte)                                                                                                                          |
| Cleanup 3: Comment Profile Preload Ownership | `done` | `CommentList` support VM に残っていた `fetchProfiles()` preload を feature helper へ移した | [src/lib/components/comment-list-view-model.svelte.ts](/root/src/github.com/ikuradon/Resonote/src/lib/components/comment-list-view-model.svelte.ts)                                                                                                            |
| Cleanup 4: Playbook Timer Helper化           | `done` | demo/playbook の raw interval を shared helper に揃えた                                    | [src/web/routes/playbook/playbook-content-view-model.svelte.ts](/root/src/github.com/ikuradon/Resonote/src/web/routes/playbook/playbook-content-view-model.svelte.ts)                                                                                          |
| Cleanup 5: Relay / Podbean Support Logic     | `done` | low-level lifecycle/bootstrap を helper または bootstrap 側へ寄せた                        | [src/lib/components/RelayStatus.svelte](/root/src/github.com/ikuradon/Resonote/src/lib/components/RelayStatus.svelte), [src/lib/components/PodbeanEmbed.svelte](/root/src/github.com/ikuradon/Resonote/src/lib/components/PodbeanEmbed.svelte)                 |
| Cleanup 6: Final Sweep                       | `done` | residual 検索結果と検証結果を最新化した                                                    | residual grep 一式                                                                                                                                                                                                                                             |

### 実行順

1. `Cleanup 1` を先に行う
   - route facade の残件を最初に消すと、`Checkpoint D` の grep 結果が一気に小さくなる
2. `Cleanup 2` を次に行う
   - direct `dev-tools` store import を bridge 化すると、route 側 direct store 例外がさらに減る
3. `Cleanup 3` を進める
   - `CommentList` の preload ownership を feature か shared helper へ寄せ、`lib/components/*.svelte.ts` の責務を presentation-support まで縮める
4. `Cleanup 4` と `Cleanup 5` を片付ける
   - playbook / embed / relay status の low-level support を helper 群へ揃える
5. 最後に `Cleanup 6` を実施する
   - grep / lint / test を取り直して、residual を再定義する

### Workstream 詳細

#### Cleanup 1: Thin Confirm Facade Removal

目的:

- route が `ConfirmDialog` の open/title/message/variant を組み立てる役を持たないようにする

タスク:

- [x] `features/profiles/ui/profile-page-view-model.svelte.ts` に confirm dialog descriptor を追加する
- [x] `features/mute/ui/mute-settings-view-model.svelte.ts` に confirm dialog descriptor を追加する
- [x] [src/web/routes/profile/[id]/+page.svelte](/root/src/github.com/ikuradon/Resonote/src/web/routes/profile/[id]/+page.svelte) を descriptor を読むだけにする
- [x] [src/web/routes/settings/MuteSettings.svelte](/root/src/github.com/ikuradon/Resonote/src/web/routes/settings/MuteSettings.svelte) を descriptor を読むだけにする

完了条件:

- `rg -n 'confirmAction' src/web/routes src/lib/components --glob '!**/*.test.*'` の hit が route facade から消える

#### Cleanup 2: Dev Tools Bridge化

目的:

- settings route から `dev-tools.svelte.ts` 直接依存を外し、UI-support でも公開 bridge を通す

タスク:

- [x] `src/shared/browser/dev-tools.ts` を追加する
- [x] `db stats` / `service worker` / `clear data` / `debug info` API を bridge 経由へ揃える
- [x] [src/web/routes/settings/DeveloperTools.svelte](/root/src/github.com/ikuradon/Resonote/src/web/routes/settings/DeveloperTools.svelte) の direct store import を除去する
- [x] lint の UI-support 例外を必要最小限に見直す

完了条件:

- `DeveloperTools.svelte` が `$lib/stores/dev-tools.svelte.js` を直接 import しない

#### Cleanup 3: Comment Profile Preload Ownership

目的:

- `CommentList` support VM に残る profile preload を component support code から切り離す

タスク:

- [x] `fetchProfiles(pubkeys)` を feature comments 側の preload helper へ移すか、`$shared/browser/profile` に batch preload helper を追加する
- [x] [src/lib/components/comment-list-view-model.svelte.ts](/root/src/github.com/ikuradon/Resonote/src/lib/components/comment-list-view-model.svelte.ts) は preload trigger ではなく selector と interaction だけを持つ形にする
- [x] `CommentList` の profile preload が route / feature / shared のどこに属するかを README/CLAUDE に短く反映する

完了条件:

- `rg -n 'fetchProfiles\\(' src/lib/components --glob '!**/*.test.*'` の hit が 0 になる

#### Cleanup 4: Playbook Timer Helper化

目的:

- playbook の demo timer を raw `setInterval` ではなく既存 helper 群に揃える

タスク:

- [x] `highlightTick` 更新を `interval-task` または専用 helper に置き換える
- [x] playback demo loop を `interval-task` または専用 helper に置き換える
- [x] playbook は `dev-only UI infrastructure` として残す部分と helper 化する部分を分離する

完了条件:

- `rg -n 'setInterval\\(' src/web/routes/playbook src/lib/components --glob '!**/*.test.*'` の hit が playbook から消える

#### Cleanup 5: Relay / Podbean Support Logic

目的:

- 残っている low-level lifecycle/bootstrap を helper または bootstrap へ寄せる

タスク:

- [x] [src/lib/components/RelayStatus.svelte](/root/src/github.com/ikuradon/Resonote/src/lib/components/RelayStatus.svelte) の `initRelayStatus()` 呼び出し位置を再評価し、app shell/bootstrap 側へ寄せられるか確認する
- [x] `stateLabel()` のような display support を route/component local として残すか helper 化するか決める
- [x] [src/lib/components/PodbeanEmbed.svelte](/root/src/github.com/ikuradon/Resonote/src/lib/components/PodbeanEmbed.svelte) の iframe load + widget bind/unbind を helper へ切り出す
- [x] `Podbean` bootstrap の cleanup を test で固定する

完了条件:

- `RelayStatus` と `PodbeanEmbed` に残る lifecycle/bootstrap detail が local に閉じるか helper に移るか、どちらかで説明できる

#### Cleanup 6: Final Sweep

目的:

- grep / lint / docs を最終 residual 0 ベースに取り直す

タスク:

- [x] `confirmAction` / `fetchProfiles` / `setInterval` / direct store usage の grep を再実行する
- [x] `pnpm check` / `pnpm lint` / `pnpm test` を再実行する
- [x] この文書の `最終 residual` を最新状態へ更新する
- [x] `README.md` と `CLAUDE.md` の residual policy を必要なら再度縮める

完了条件:

- `最終 residual` に載る項目が「本当に残すもの」だけになっている

## 長期ロードマップ

### Horizon 1: 表層責務の収束

目的:

- route / component に残る orchestration を片付ける

対象:

- `MuteSettings`
- notifications page と bell の収束
- `CommentCard` 周辺の profile 表示責務整理
- その他 route-local の preload / confirm / toggle / dialog state

完了条件:

- route / component が confirm flow や preload batch や display selector を新規定義する場所ではなくなる

### Horizon 2: 境界の固定

目的:

- 現在の構造が戻らないようにする

対象:

- lint の追加・強化
- 残置を許容する direct import の明文化
- public bridge 利用方針の固定

完了条件:

- 間違った場所に新しいロジックを書くほうが、正しい場所に置くより面倒になる

### Horizon 3: 収束完了と凍結

目的:

- 「構造移行」を終わらせる

対象:

- retired になった文書の整理
- 最終 residual の明文化
- 通常開発へ移るための stop condition の固定

完了条件:

- 「このコードはどこに置くべきか」の答えが repo 全体で退屈なくらい明確になる

## 短期マイルストーン

### Milestone 1: Settings Surface Cleanup

Status: `done`

目的:

- `MuteSettings` から confirm/action orchestration を外す

完了条件:

- [src/web/routes/settings/MuteSettings.svelte](/root/src/github.com/ikuradon/Resonote/src/web/routes/settings/MuteSettings.svelte) が `confirmAction` を持たない

作業チェックリスト:

- [x] `MuteSettings` 用 view-model を追加する
- [x] `newMuteWord` の state を view-model へ移す
- [x] mute word add の confirm orchestration を view-model へ移す
- [x] unmute user の confirm orchestration を view-model へ移す
- [x] unmute word の confirm orchestration を view-model へ移す
- [x] enter key handling を route から外すか、view-model 前提の最小責務に縮める
- [x] `ConfirmDialog` 連携を route から読むだけの形にする
- [x] `pnpm check` を通す
- [x] `pnpm lint` を通す
- [x] `pnpm test` を通す
- [x] `Checkpoint A` と `Checkpoint D` を更新する

### Milestone 2: Notifications Surface Convergence

Status: `done`

目的:

- notifications page と bell の表示責務を収束させる

完了条件:

- [src/web/routes/notifications/+page.svelte](/root/src/github.com/ikuradon/Resonote/src/web/routes/notifications/+page.svelte) と [src/lib/components/NotificationBell.svelte](/root/src/github.com/ikuradon/Resonote/src/lib/components/NotificationBell.svelte) が同じ display-facing helper 群を使う

作業チェックリスト:

- [x] actor display name / picture / profile path を返す helper を切り出す
- [x] reaction 表示整形の責務を page と bell の両方から揃える
- [x] target comment preview 表示の扱いを page と bell で揃える
- [x] content path link の扱いを page と bell で揃える
- [x] notifications page から raw `getProfile()` / `getDisplayName()` の散在を減らす
- [x] bell と page で同じ表示 selector を使う
- [x] `pnpm check` を通す
- [x] `pnpm lint` を通す
- [x] `pnpm test` を通す
- [x] `Checkpoint A` / `Checkpoint D` / `Checkpoint E` を更新する

### Milestone 3: Comment / Profile Presentation Cleanup

Status: `done`

目的:

- `CommentCard` を presentation-first に寄せる

完了条件:

- [src/lib/components/CommentCard.svelte](/root/src/github.com/ikuradon/Resonote/src/lib/components/CommentCard.svelte) が profile display rule の中心ではなくなる

作業チェックリスト:

- [x] `ProfileHeader` の follows preload / toggle orchestration を view-model 化する
- [x] `CommentCard` に残る profile picture / display name / nip05 表示責務を棚卸しする
- [x] profile 表示用の shared helper か feature-facing selector が必要か判断する
- [x] 必要なら `CommentCard` 用 display helper を追加する
- [x] `CommentCard.svelte` から read-side 組み立てロジックを減らす
- [x] `pnpm check` を通す
- [x] `pnpm lint` を通す
- [x] `pnpm test` を通す
- [x] `Checkpoint A` / `Checkpoint D` / `Checkpoint E` を更新する

### Milestone 4: Policy / Docs Freeze

Status: `done`

目的:

- 最終構造を文書と運用ルールに固定する

完了条件:

- この文書、`README.md`、`CLAUDE.md` が最終状態と一致する

作業チェックリスト:

- [x] 終盤ロードマップを単一ファイルに統合した
- [x] 進捗管理用の status / board / log を追加した
- [x] すべてのマイルストーン完了後に現状に合わせて本文を見直す
- [x] `README.md` の構造説明を最終状態に合わせる
- [x] `CLAUDE.md` の運用ルールと最終 residual を再確認する
- [x] archive 文書の役割を明確化する

## タスク細分化

ここでは、直近で実際に手を動かす順序まで落とし込みます。

### 直近スプリント候補

#### Sprint A

目的:

- `MuteSettings` を view-model 化する

タスク:

- [x] `features/mute/ui/mute-settings-view-model.svelte.ts` を追加する
- [x] confirm state を route から移す
- [x] add/remove action を route から移す
- [x] route を thin facade にする
- [x] 検証を通す

#### Sprint B

目的:

- notifications page と bell の display helper を一本化する

タスク:

- [x] actor display helper を作る
- [x] picture fallback を helper 化する
- [x] profile href を helper 化する
- [x] page と bell の rendering 呼び出しを揃える
- [x] 検証を通す

#### Sprint C

目的:

- `CommentCard` の profile display 組み立てを減らす

タスク:

- [x] 現在の profile display dependency を洗う
- [x] helper へ寄せる責務を決める
- [x] `CommentCard` を presentation-first に寄せる
- [x] 検証を通す

#### Sprint D

目的:

- policy / docs freeze に入る

タスク:

- [x] hotspot が本当に残っていないか再検索する
- [x] lint 例外の妥当性を再確認する
- [x] 本文書、README、CLAUDE を最終状態に合わせる
- [x] stop condition を `done` に更新する

## チェックポイント

マイルストーンは、対応するチェックポイントが通るまで完了扱いにしません。

### Checkpoint A: 検証ベースライン

実行:

```bash
pnpm check
pnpm lint
pnpm test
```

合格条件:

- `svelte-check` が `0 errors / 0 warnings`
- `eslint` が通る
- `vitest` が通る

現在:

- Status: `done`
- 最終確認: 2026-03-21

### Checkpoint B: legacy runtime ownership 不増

実行:

```bash
rg -n '\$lib/(nostr|content|utils)' src --glob '!**/*.test.*'
```

合格条件:

- 新しい runtime ownership 逆流がない
- 残るものが意図的なものとして説明できる

現在:

- Status: `done`
- 最終確認: 2026-03-21

### Checkpoint C: `lib/stores` は UI-support のみ

実行:

```bash
find src/lib/stores -maxdepth 1 -type f | sort
```

合格条件:

- `src/lib/stores` に business/domain store が増えていない
- UI-support だけが残っている

現在:

- Status: `done`
- 最終確認: 2026-03-21

### Checkpoint D: route / component hotspot 縮小

実行:

```bash
rg -n 'confirmAction|fetchProfiles\(|fetchProfile\(|setInterval\(|document\.addEventListener\(' \
  src/web/routes src/lib/components --glob '!**/*.test.*'
```

合格条件:

- 各 hit が次のどちらかに収まる
  - 意図的な low-level UI infrastructure
  - 次の cleanup 対象として明示済み

現在:

- Status: `done`
- 最終確認: 2026-03-21
- 補足:
  - `CommentCard` と `ProfileHeader` の profile display は shared helper 経由に収束済み
  - 残る hit は thin facade の `confirmAction` 参照と low-level UI infrastructure の timer / preload だけ

### Checkpoint E: public bridge 優先

実行:

```bash
rg -n '\$lib/stores/.*svelte|../stores/.*svelte' src --glob '!**/*.test.*'
```

合格条件:

- 残る direct store usage が意図的な UI-support に限られる
- app / feature / component が shared bridge を優先している

現在:

- Status: `done`
- 最終確認: 2026-03-21

## Stop Condition

Status: `done`

根拠:

- runtime ownership は `src/shared/*` / `src/features/*` / `src/app/*` に収束している
- `src/lib/*` に残るのは presentation と component-local helper だけで説明可能
- `confirmAction` / `fetchProfiles` / `fetchProfile` / `setInterval` / raw `document.addEventListener` の hotspot 再検索結果は 0 件
- direct store usage と legacy i18n runtime import は 0 件で、UI-support runtime ownership も `shared/browser` / `shared/i18n` に寄せた
- `README.md`、`CLAUDE.md`、本文書が同じ構造認識に揃っている

## 追加運用強化

Status: `done`

完了内容:

- CI が import graph summary / dot を artifact として保存する
- CI が bundle profile を artifact として保存する
- PR / Issue template が ownership と perf impact を要求する
- component-local helper のうち壊れやすい orchestration に単体テストを追加した
- README / CLAUDE / 本文書が `check:structure` / import graph / bundle profile の運用を明記している

対象:

- [ci.yml](/root/src/github.com/ikuradon/Resonote/.github/workflows/ci.yml)
- [PULL_REQUEST_TEMPLATE.md](/root/src/github.com/ikuradon/Resonote/.github/PULL_REQUEST_TEMPLATE.md)
- [task.yml](/root/src/github.com/ikuradon/Resonote/.github/ISSUE_TEMPLATE/task.yml)
- [feature_request.yml](/root/src/github.com/ikuradon/Resonote/.github/ISSUE_TEMPLATE/feature_request.yml)
- [bug_report.yml](/root/src/github.com/ikuradon/Resonote/.github/ISSUE_TEMPLATE/bug_report.yml)
- [print-bundle-summary.mjs](/root/src/github.com/ikuradon/Resonote/scripts/print-bundle-summary.mjs)
- [audio-embed-view-model.test.ts](/root/src/github.com/ikuradon/Resonote/src/lib/components/audio-embed-view-model.test.ts)
- [comment-list-view-model.test.ts](/root/src/github.com/ikuradon/Resonote/src/lib/components/comment-list-view-model.test.ts)

## 最終フェーズの運用ルール

- interop layer は、減るコード量が増えるコード量を上回るときだけ作る
- route / component に state を足す前に、view-model / helper 抽出を先に検討する
- page と component の両方で使う表示ロジックは、先に集約してから cleanup する
- `src/lib` は退屈であるべき
- `features` / `app` に新しい direct `$lib` import を足すのは原則 regressions とみなす

## 進捗ログ

- 2026-03-21: 終盤ロードマップ文書を作成した
- 2026-03-21: 本文書を進捗管理可能な形式に更新した
- 2026-03-21: app shell orchestration を `src/app/ui/app-shell-view-model.svelte.ts` に集約した
- 2026-03-21: click-outside handling を `src/shared/browser/click-outside.svelte.ts` に集約した
- 2026-03-21: `[nip19]` route の decode/fetch/redirect/error を feature helper / view-model へ移した
- 2026-03-21: `PlaybookContent` の route-local state/timer/virtual-scroll coordination を view-model 化した
- 2026-03-21: `LoginButton` を view-model 化し、toast / locale の bridge usage を拡張した
- 2026-03-21: `ProfileHeader` の follows preload / toggle orchestration を view-model 化した
- 2026-03-21: `MuteSettings` の confirm / add-remove orchestration を `features/mute/ui/mute-settings-view-model.svelte.ts` に移した
- 2026-03-21: notifications page と `NotificationBell` の表示責務を `features/notifications/ui/notification-display.ts` の共通 helper に収束させた
- 2026-03-21: profile display helper を `shared/browser/profile.ts` に追加し、`CommentCard` / `ProfileHeader` / notifications / login / mute settings の表示組み立てを収束させて Milestone 3 を完了した
- 2026-03-21: hotspot 再検索、lint 例外確認、README / CLAUDE / 本文書の最終更新を行い、Milestone 4 と stop condition を完了した
- 2026-03-21: Cleanup 1-3 を完了し、route の confirm facade、`DeveloperTools` の direct dev-tools import、`CommentList` support VM の profile preload ownership を整理した
- 2026-03-21: Cleanup 4-6 を完了し、playbook timer の helper 化、`RelayStatus` bootstrap の app shell 集約、`Podbean` bootstrap helper 化、最終 residual 更新まで閉じた
- 2026-03-21: intentional residual も 0 にする `Residual Zero Program` を追加し、`locale` / `toast` / `dev-tools` / `i18n` / `emoji-mart` の完全移管計画を定義した
- 2026-03-21: Residual 1-3 を完了し、`locale` / `toast` / `dev-tools` を `shared/browser` owner へ反転、`t()` を `shared/i18n` へ昇格、`emoji-mart` preload を `shared/browser` へ移した
- 2026-03-21: Residual 4-5 を完了し、`src/lib/stores` interop を削除、lint 例外を 0 にし、Residual Zero Achieved まで文書を更新した
- 2026-03-21: additional hardening を完了し、`docs/archive/` へ履歴文書を移動、`shared/i18n` に辞書を一本化、structure guard test と helper audit を追加した
- 2026-03-21: import graph / bundle profile artifact、PR・Issue template の ownership/perf 運用、component-local helper の追加テストを入れて、追加運用強化まで完了した
