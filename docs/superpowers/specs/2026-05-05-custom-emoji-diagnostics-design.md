# Custom Emoji Diagnostics Design

## 背景

投稿画面の custom emoji は、ログイン中ユーザーの `kind:10030` list と、そこから参照される `kind:30030` emoji set に依存する。現在は picker/autocomplete が空になったとき、アプリ上で `10030` / `30030` が取得できているのか、取得後に有効な emoji がないのか、単に cache が古いのかを確認しづらい。

この設計では、通常の Settings に概要と操作を置き、DeveloperTools に取得詳細を置く。通常ユーザーは状態と回復操作を見られ、開発・診断時は `10030` / `30030` の source 解決状況まで確認できる。

## Goals

- Settings で custom emoji の取得状態を簡潔に確認できる。
- Settings からログイン中ユーザーの custom emoji を再取得できる。
- Settings から DB 内の全 `kind:10030` / `kind:30030` cache を削除できる。
- DeveloperTools で `10030` / `30030` の保存件数、source 解決、missing refs、`created_at` を確認できる。
- Picker/autocomplete 用の `emoji-sets` state と診断 state の責務を分ける。

## Non-Goals

- relay ごとの取得成功・失敗の表示は含めない。
- 投稿画面内に custom emoji 診断 warning は出さない。
- custom emoji の編集、作成、公開 UI は作らない。
- `kind:10030` / `kind:30030` 以外の IndexedDB cache 削除は扱わない。

## Approach

`src/shared/browser/custom-emoji-diagnostics.svelte.ts` を追加し、Settings と DeveloperTools が同じ診断 state と action を使う。`emoji-sets` は picker/autocomplete が使う category state の所有に集中させる。

診断 module は Auftakt facade 経由で source 解決を一度だけ実行し、その同じ結果から diagnostics と picker/autocomplete 用 categories の両方を導出する。`Refresh` は成功時だけ `emoji-sets` categories を置き換える。`Refresh` が失敗した場合は既存 categories を保持し、診断 state に `error` と `stale: true` を設定する。`Clear emoji cache` は DB 内の全 `kind:10030` / `kind:30030` を削除し、診断 state と `emoji-sets` を空に戻す。

## Data Model

診断 state は次の情報を持つ。

```ts
type CustomEmojiDiagnosticStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';
type CustomEmojiEmptyReason =
  | 'no-list-event'
  | 'no-emoji-sources'
  | 'only-invalid-set-refs'
  | 'all-set-refs-missing'
  | 'resolved-sets-empty'
  | 'no-valid-emoji';

type CustomEmojiSetResolution = 'cache' | 'relay' | 'memory' | 'unknown';
type CustomEmojiSourceMode = 'cache-only' | 'relay-checked' | 'unknown';

interface CustomEmojiDiagnostics {
  pubkey: string | null;
  requestId: number;
  status: CustomEmojiDiagnosticStatus;
  isRefreshing: boolean;
  isClearing: boolean;
  emptyReason: CustomEmojiEmptyReason | null;
  lastCheckedAtMs: number | null;
  dbCounts: {
    kind10030: number;
    kind30030: number;
  };
  summary: {
    categoryCount: number;
    emojiCount: number;
  };
  listEvent: {
    id: string;
    createdAtSec: number;
    inlineEmojiCount: number;
    referencedSetRefCount: number;
  } | null;
  sets: Array<{
    ref: string;
    id: string;
    pubkey: string;
    dTag: string;
    title: string;
    createdAtSec: number;
    emojiCount: number;
    resolvedVia: CustomEmojiSetResolution;
  }>;
  missingRefs: string[];
  invalidRefs: string[];
  warnings: string[];
  sourceMode: CustomEmojiSourceMode;
  error: string | null;
  stale: boolean;
  lastSuccessfulAtMs: number | null;
}
```

`createdAtSec` は Nostr event の `created_at` を Unix 秒として保持する。`lastCheckedAtMs` はアプリが最後に診断 refresh を実行した時刻を millisecond timestamp として保持する。UI formatter は `formatNostrTimestampSec(createdAtSec)` と `formatAppTimestampMs(lastCheckedAtMs)` のように分け、単位混同を防ぐ。

`lastCheckedAtMs` は成功・失敗を問わず最後に refresh を試みた時刻を表す。`lastSuccessfulAtMs` は diagnostics と categories の更新に最後に成功した時刻を表す。ここでの成功は `ready` だけでなく、source resolution が完了して `empty` と判定された場合も含む。`status: 'error'` かつ `stale: true` の場合、`summary`、`listEvent`、`sets`、`missingRefs`、`invalidRefs`、`warnings`、`sourceMode` は前回成功時の値を保持し、`error` と `lastCheckedAtMs` だけを今回失敗分に更新する。前回成功結果が存在しない初回 refresh 失敗では `stale: false` とし、source 情報は空にする。

`stale: true` の Settings 文言は保持している前回成功結果に合わせる。`summary.emojiCount > 0` の場合は「前回取得済みの emoji を使用中」と表示し、`summary.emojiCount === 0` の場合は「前回の診断結果を表示中」と表示する。

## Runtime / Facade

`packages/resonote/src/runtime.ts` には source 解決の診断情報を返す `fetchCustomEmojiSourceDiagnostics` helper を追加する。既存 `fetchCustomEmojiSources` と `fetchCustomEmojiCategories` の戻り値は変更しない。`fetchCustomEmojiSourceDiagnostics` は source 解決結果と categories を同時に返し、browser module が二重 fetch しないようにする。

```ts
interface CustomEmojiSourceDiagnosticsResult {
  diagnostics: CustomEmojiDiagnosticsSource;
  categories: EmojiCategory[];
}
```

`CustomEmojiDiagnosticsSource` は runtime-facing の source shape で、browser-facing `CustomEmojiDiagnostics` から UI 状態、`lastCheckedAtMs`、`stale` を除いた event/source 情報を持つ。

必要な情報は以下。

- `listEvent`: `kind:10030` event。id と `created_at` を含む。
- `setEvents`: 解決できた `kind:30030` events。id、pubkey、`d` tag、title、`created_at`、有効 emoji count、`resolvedVia` を導出できる。
- `missingRefs`: `10030` の `a` tag に存在する形式が正しい refs のうち、今回利用可能だった source resolution path で解決できなかった unique `30030:pubkey:d` refs。`sourceMode: 'cache-only'` の場合、relay 上に存在しないことまでは意味しない。
- `invalidRefs`: malformed な `a` tag の diagnostic 表示用文字列。`tag[1]` が存在する場合は `tag[1]`、存在しない場合は compact serialized tag を入れる。DeveloperTools の copy payload では可能な限り raw tag も含める。
- set title fallback は `title` tag、`name` tag、`d` tag、短縮 event id の順に使い、UI に空 title を出さない。
- `inlineEmojiCount` は valid inline emoji count とし、malformed `emoji` tags は含めない。
- `referencedSetRefCount` は valid な `30030:pubkey:d` refs を duplicate `a` tag dedupe 後に数えた値とする。raw `a` tag count は必要になるまで model に含めない。

replaceable event の選択規則:

- `kind:10030` は対象 pubkey の最新 `created_at` event を採用する。
- `kind:30030` は `30030:pubkey:d` address ごとの最新 `created_at` event を採用する。
- 同一 address に同じ `created_at` の event が複数ある場合は、event id の lexicographic order で deterministic に選択する。
- Category order は inline emoji category を先頭に置き、その後に `10030` の valid `a` tag の出現順で resolved set categories を並べる。
- duplicate `a` tag は最初の出現位置を保持して dedupe する。
- `summary.categoryCount` と `summary.emojiCount` は、実際に picker/autocomplete に渡す `EmojiCategory[]` から算出する。
- 同一 category 内の duplicate shortcode は最初の valid emoji を採用する。category をまたぐ同一 shortcode は許容し、diagnostics では重複排除しない。
- `dbCounts` は raw stored event count として表示する。これは現在 pubkey の resolved set 数とは意味が違うため、Settings には current account の summary を出し、DeveloperTools に global DB counts として表示する。logical count が必要な場合は DeveloperTools に別名で追加する。
- `dbCounts` は source resolution と必要な storage update が完了した後の raw stored event count とする。

`src/shared/auftakt/resonote.ts` は app 側に `fetchCustomEmojiSourceDiagnostics(pubkey)` と `deleteStoredEventsByKinds(kinds)` を export する。既存の `fetchCustomEmojiCategories(pubkey)` は picker/autocomplete 用の public entry として維持する。

## Browser Module

`src/shared/browser/custom-emoji-diagnostics.svelte.ts` は以下を提供する。

- `getCustomEmojiDiagnostics()`: Svelte rune state の deep readonly read interface。
- `refreshCustomEmojiDiagnostics(pubkey: string)`: source と categories を取得し、診断 state と `emoji-sets` を更新する。
- `resetCustomEmojiDiagnosticsForPubkey(pubkey: string | null)`: ログイン pubkey 変更時に呼び、operation version を進めて旧 pubkey の in-flight refresh 結果を無効化する。
- `clearCustomEmojiCache()`: DB 内の全 `kind:10030` / `kind:30030` を削除し、診断 state と `emoji-sets` を reset する。

`getCustomEmojiDiagnostics()` は外部 mutation できない deep readonly read interface を返す。`sets`、`missingRefs`、`invalidRefs`、`warnings` などの array も呼び出し側から mutate できない形にする。module import 時に IndexedDB、`window`、`navigator` へ top-level access しない。browser API は `refreshCustomEmojiDiagnostics` / `clearCustomEmojiCache` の実行時にだけ触る。

state は対象 `pubkey` を保持する。`refreshCustomEmojiDiagnostics(pubkey)` の完了時に request pubkey と active pubkey が一致する場合だけ commit する。ログイン切り替え中に古い request 結果が新しいユーザーの Settings に表示されないようにする。

active pubkey の guard は caller-driven とする。ログイン pubkey が変わった場合、caller は `resetCustomEmojiDiagnosticsForPubkey(newPubkey)` を呼ぶ。この reset は `operationVersion` を進め、state を新しい pubkey 用の `idle` に戻す。旧 pubkey の in-flight refresh 結果は version mismatch で commit されない。

`Refresh` と `Clear emoji cache` は `requestId` / operation version で競合を防ぐ。`isRefreshing` と `isClearing` は module state に持ち、Settings と DeveloperTools の両方が同じ操作中状態を参照できるようにする。

```ts
let operationVersion = 0;

async function refreshCustomEmojiDiagnostics(pubkey: string) {
  const version = startOperation('refresh');
  try {
    // fetch...
    if (version !== operationVersion) return;
    // commit
  } finally {
    if (version === operationVersion) state.isRefreshing = false;
  }
}

async function clearCustomEmojiCache() {
  const version = startOperation('clear');
  try {
    // delete...
    if (version !== operationVersion) return;
    // reset
  } finally {
    if (version === operationVersion) state.isClearing = false;
  }
}
```

新しい operation を開始するときは、古い operation の loading flag を正規化する。`operationVersion` は古い commit を防ぐために使い、古い operation の `finally` に loading flag の cleanup を依存させない。

```ts
function startOperation(kind: 'refresh' | 'clear') {
  if (kind === 'refresh' && state.isClearing) {
    throw new Error('Cannot refresh while clearing custom emoji cache');
  }
  const version = ++operationVersion;
  state.requestId = version;
  state.isRefreshing = kind === 'refresh';
  state.isClearing = kind === 'clear';
  return version;
}
```

`status: 'loading'` は表示可能な前回結果がない初回 refresh のみ使う。既存の `ready` / `empty` / `error` 結果がある状態で refresh する場合、`status` は維持し、`isRefreshing: true` だけを設定する。

`Refresh` 成功時は diagnostics と categories を同じ source 解決結果から更新し、`lastSuccessfulAtMs` も更新する。`Refresh` 失敗時は既存 categories を保持し、診断 state を `status: 'error'`, `stale: true` にする。前回成功結果がある場合は前回成功 diagnostics を保持し、前回成功結果がない場合は source 情報を空のままにする。`stale: true` で保持してよい diagnostics/categories は、現在の `state.pubkey` と同じ pubkey の前回成功結果だけとする。`Clear emoji cache` 成功時だけ categories を空にする。

ログイン pubkey が変わった場合、旧 pubkey の picker/autocomplete categories は保持しない。caller は diagnostics reset と同時に `emoji-sets` categories を空にするか、新 pubkey 用の reload を開始する。旧 pubkey の categories を新 pubkey の picker/autocomplete に表示してはならない。

`clearCustomEmojiCache` は destructive operation なので、実行中は新しい refresh を開始しない。in-flight refresh は browser state へ commit してはならない。runtime/storage write を伴う refresh は custom emoji cache generation を受け取り、write 前に generation が現在値と一致することを検証する。`clearCustomEmojiCache()` 成功時は custom emoji cache generation を進める。古い generation の refresh が clear 後に完了しても、`kind:10030` / `kind:30030` を storage に再保存してはならない。

`clearCustomEmojiCache()` 成功後、diagnostics state は現在の `state.pubkey` を保持したまま `status: 'idle'` に戻す。`summary`、`listEvent`、`sets`、`missingRefs`、`invalidRefs`、`warnings`、`error`、`stale`、`lastSuccessfulAtMs` は reset する。`dbCounts.kind10030` と `dbCounts.kind30030` は `0` に更新し、`lastCheckedAtMs` は `null` に reset する。

`clearCustomEmojiCache()` は削除に失敗したら既存 diagnostics/categories/status を保持し、`error` に clear failure message を入れたうえで例外を throw する。確認 dialog を閉じるか、dialog 内に error を出すかは `CustomEmojiSettings.svelte` 側が決める。

## Settings UI

`src/web/routes/settings/CustomEmojiSettings.svelte` を追加し、`src/web/routes/settings/+page.svelte` で `RelaySettings` と `MuteSettings` の近くに配置する。

表示内容:

- 未ログイン: ログインすると custom emoji status を確認できる旨を表示。
- idle: `Not checked yet` と `Refresh` を表示する。ログイン中で Settings を開いた場合は初回 mount 時に自動 refresh する。
- loading: `10030` / `30030` の取得中状態。
- empty: `emptyReason` に応じて短い理由を表示する。
- ready: user-facing な文言で `Custom emoji list found`、`Emoji sets: N`、`Emojis: N`、`List updated`、`Last checked` を表示する。`kind:10030` / `kind:30030` の技術名は DeveloperTools を中心に出す。
- error: 取得失敗 message と `Refresh`。`stale` の場合、`summary.emojiCount > 0` なら「前回取得済みの emoji を使用中」、`summary.emojiCount === 0` なら「前回の診断結果を表示中」と表示する。

操作:

- `Refresh`: 現在 pubkey の `10030` / `30030` を再取得する。
- `Clear emoji cache`: `Advanced` 領域に `Reset local custom emoji cache...` として置く。確認 dialog 後、全 `kind:10030` / `kind:30030` cache を削除する。

削除確認 dialog は、全ユーザー分の custom emoji cache に影響することと、公開済み Nostr event は削除しないことを明記する。

確認文言:

> This deletes locally cached custom emoji lists and emoji sets for all accounts on this device.
> Your published Nostr events will not be deleted.
> You may need to refresh custom emoji again after this.

## DeveloperTools UI

`src/web/routes/settings/DeveloperTools.svelte` に `Emoji diagnostics` block を追加する。

表示内容:

- DB count: `kind:10030`, `kind:30030`。
- `10030`: id、`created_at`、inline emoji count、referenced set refs。
- `30030`: resolved set count、各 set の `d` tag / title / `created_at` / emoji count / `resolvedVia`。
- `missingRefs`: count と短縮 refs。形式は正しいが解決できなかった refs のみを含む。
- `invalidRefs`: malformed `a` tag の count と短縮表示。
- category count、emoji count、last checked、warnings、error。

既存の DB stats 表示は残す。Emoji diagnostics は、general stats より source 解決に寄せた情報として別 block にする。

長い診断情報の表示規則:

- missing refs と invalid refs は最初の 20 件だけ表示する。
- 全 refs を取得できる copy action を用意する。
- set 一覧は collapsible にする。
- ref は短縮表示し、full ref は copy 対象に含める。
- `sourceMode: 'cache-only'` で unresolved refs がある場合は「一部の参照は local source では解決できませんでした。relay 上に存在しないことを意味するとは限りません。」という caveat を表示する。

## Error Handling

- source fetch が失敗した場合は `status: 'error'` とし、message を表示する。
- source fetch が失敗しても、既存 `emoji-sets` categories は消さない。`stale: true` で前回取得済みの emoji を使っていることを示す。
- `10030` が存在しない場合は `status: 'empty'`, `emptyReason: 'no-list-event'` とする。
- `10030` は存在するが有効な inline emoji も valid set refs もない場合は `emptyReason: 'no-emoji-sources'` とする。
- `10030` に malformed `a` tag だけが存在する場合は `emptyReason: 'only-invalid-set-refs'` とする。
- 全 set refs が missing の場合は `emptyReason: 'all-set-refs-missing'` とする。
- set は解決できたが全 set の有効 emoji count が 0 の場合は `emptyReason: 'resolved-sets-empty'` とする。
- inline emoji と resolved set emoji の合計が 0 で、上記のどれにも分類できない場合は `emptyReason: 'no-valid-emoji'` とする。
- `missingRefs` があっても、一部 category が作れる場合は `ready` とし、DeveloperTools に missing refs を出す。
- relay fetch が失敗しても cache から category が作れる場合は `ready` とし、`warnings` と `sourceMode: 'cache-only'` で cache 由来であることを示す。`sourceMode: 'cache-only'` の場合、resolved set の `resolvedVia` は `cache` または `memory` のみとする。`resolvedVia: 'relay'` を含む場合、`sourceMode` は `relay-checked` とする。`sourceMode: 'unknown'` は error、idle、または source resolution が未完了の場合だけ使う。
- malformed `a` tag は `invalidRefs` に出し、missing refs には含めない。
- cache delete が失敗した場合、browser module は reset せずに error を state に入れて throw する。確認 dialog を閉じない挙動と dialog error 表示は Settings component の責務とする。

top-level diagnostics operation が `CustomEmojiSourceDiagnosticsResult` を返せない場合は `status: 'error'` とする。一方、relay fetch の一部または全部が失敗しても local cache / memory から result を構築できる場合は throw せず、`ready` または `empty` とし、`warnings` と `sourceMode` に反映する。

empty reason の優先順位:

1. `!listEvent` -> `no-list-event`
2. `totalEmojiCount > 0` -> `ready`
3. `validInlineEmojiCount === 0 && validSetRefCount === 0 && invalidRefs.length > 0` -> `only-invalid-set-refs`
4. `validInlineEmojiCount === 0 && validSetRefCount === 0` -> `no-emoji-sources`
5. `validSetRefCount > 0 && resolvedSetCount === 0 && missingRefs.length === validSetRefCount` -> `all-set-refs-missing`
6. `resolvedSetCount > 0 && resolvedSetEmojiCount === 0` -> `resolved-sets-empty`
7. fallback -> `no-valid-emoji`

## Testing

- `packages/resonote/src/custom-emoji.contract.test.ts`
  - `listEvent.created_at` と `setEvents.created_at` が診断情報に含まれる。
  - `missingRefs` が、今回利用可能だった source resolution path で解決できなかった valid `30030` refs を返す。
  - malformed `a` tag が `invalidRefs` に入り、`missingRefs` と分かれる。
  - duplicate `a` tag が dedupe される。
  - `resolvedVia` が cache / relay の大まかな解決経路を表す。
  - `sourceMode` と `resolvedVia` の invariant が一致する。
  - 複数の `kind:10030` がある場合、最新 `created_at` の event を使う。
  - 同じ `created_at` の replaceable/addressable events は event id tie-breaker で deterministic に選択される。
  - `inlineEmojiCount` と `referencedSetRefCount` が valid/deduped count になる。
  - `30030` が解決できたが emoji count 0 の場合も diagnostics の `sets` には出る。
  - `10030` に inline emoji だけある場合は ready になる。
  - `10030` に missing refs だけある場合は empty + missingRefs になる。
  - title tag がない set は fallback title を持つ。
  - set metadata と emoji count が導出できる。

- `src/shared/browser/custom-emoji-diagnostics.test.ts`
  - `refreshCustomEmojiDiagnostics` が ready / empty / error state を作る。
  - refresh が `emoji-sets` categories も更新する。
  - refresh 失敗時に既存 `emoji-sets` categories を保持し、`stale: true` にする。
  - refresh 失敗時、前回成功した diagnostics summary/listEvent/sets を保持し、`lastCheckedAtMs` と `lastSuccessfulAtMs` が分かれる。
  - 初回 refresh 失敗時は `stale: false` になり、前回成功結果を表示しない。
  - pubkey 切り替え中の in-flight refresh 結果が古い pubkey に commit されない。
  - `resetCustomEmojiDiagnosticsForPubkey` が operation version を進め、旧 pubkey の in-flight refresh を無効化する。
  - pubkey 変更時に旧 pubkey の `emoji-sets` categories が新 pubkey の picker/autocomplete に残らない。
  - Refresh と Clear が競合したとき、古い Refresh 結果が Clear 後に復活しない。
  - refresh の runtime fetch/storage update が in-flight の状態で clear が成功した場合、古い refresh が clear 後に `10030` / `30030` を storage へ再保存しない。
  - clear 中は refresh を開始できない。
  - clear 成功後、`dbCounts.kind10030` と `dbCounts.kind30030` は `0`、`lastCheckedAtMs` は `null` になる。
  - clear 失敗時は既存 diagnostics/categories/status を保持し、`error` に clear failure message を入れて throw する。
  - refresh 中に clear が開始された場合、古い refresh の `finally` に依存せず `isRefreshing` が false になる。
  - clear 中に refresh が開始された場合、古い clear の `finally` に依存せず `isClearing` が false になる。
  - `createdAtSec`、`lastCheckedAtMs`、`lastSuccessfulAtMs` の単位と意味を混同しない。
  - `summary.categoryCount` と `summary.emojiCount` が実際に `emoji-sets` に渡された categories から算出される。
  - inline emoji category と resolved set categories の表示順が固定される。
  - `clearCustomEmojiCache` が全 `10030` / `30030` cache 削除 helper を呼び、state を reset する。
  - clear 失敗時に diagnostics / `emoji-sets` を reset せず、error を state に入れて throw する。
  - `deleteStoredEventsByKinds([10030, 30030])` が他 kind を削除しない。
  - clear 後、runtime / in-memory cache に残った `10030` / `30030` から diagnostics が復活しない。
  - `dbCounts` は refresh による storage update 後の count を表示する。
  - `getCustomEmojiDiagnostics()` の返却値は nested arrays を含めて外部 mutation できない。

- `src/shared/browser/dev-tools.svelte.test.ts`
  - `10030` / `30030` の `dbCounts` が取得できる。

- `src/web/routes/settings/custom-emoji-settings-view-model.test.ts`
  - 未ログイン時に Refresh と Reset は表示しない。
  - clear confirmation 文言に「全アカウント分」「local cache」「公開 event は削除しない」が含まれる。
  - `emptyReason` ごとに Settings の短い説明文が変わる。
  - stale error の文言が `summary.emojiCount > 0` と `summary.emojiCount === 0` で変わる。
  - `created_at` と last checked が別々に表示される。

- DeveloperTools の表示 helper tests
  - missing refs が 20 件を超える場合も表示が崩れず、copy payload には全件が含まれる。
  - `sourceMode: 'cache-only'` かつ unresolved refs がある場合に relay 未検証 caveat を表示する。

- `pnpm run check`
  - Svelte component と i18n key の型検査を通す。

## Implementation Notes

- DB から kind 単位削除する helper として `deleteStoredEventsByKinds([10030, 30030])` を追加する。全 DB 削除 API は再利用しない。
- `deleteStoredEventsByKinds` は persistent storage を削除し、関連する runtime / in-memory cache がある場合は invalidate する。少なくとも custom emoji 診断と `emoji-sets` state は reset する。
- `deleteStoredEventsByKinds([10030, 30030])` は IndexedDB の削除だけでなく、runtime が保持する kind/address/event source cache も invalidate する。削除後の `fetchCustomEmojiSourceDiagnostics` は、削除前に memory に残っていた `10030` / `30030` を返してはならない。
- `created_at` 表示は UI 側で locale-aware な短い日時に整形する。Nostr event timestamp は seconds、app-side checked timestamp は milliseconds として扱う。
- `missingRefs` の詳細表示は長くなりすぎないよう、Settings には出さず DeveloperTools にのみ出す。
- i18n keys は `settings.custom_emoji.*` と `dev.emoji.*` に分ける。
