# Custom Emoji Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Settings と DeveloperTools で custom emoji の `kind:10030` / `kind:30030` 取得状態を確認・再取得・local cache reset できるようにする。

**Architecture:** `packages/resonote` が custom emoji source 解決と diagnostics/categories 同時生成を持ち、`src/shared/auftakt/resonote.ts` が app-facing facade と storage generation を持つ。`src/shared/browser/custom-emoji-diagnostics.svelte.ts` が Svelte state と `emoji-sets` 更新を所有し、Settings と DeveloperTools は同じ read interface と action を使う。

**Tech Stack:** TypeScript, Svelte 5 runes, Vitest, SvelteKit SPA, Auftakt runtime facade, IndexedDB/Dexie event store.

---

## File Structure

- Modify: `packages/resonote/src/plugins/built-in-plugins.ts`
  - `EmojiCatalogReadModel` に diagnostics entry を追加し、diagnostics source/result 型を公開する。
- Modify: `packages/resonote/src/runtime.ts`
  - `fetchCustomEmojiSourceDiagnostics(runtime, pubkey, options?)` を追加し、既存 `fetchCustomEmojiSources` / `fetchCustomEmojiCategories` と共通 helper を使う。
  - `createResonoteCoordinator` の `fetchCustomEmojiSourceDiagnostics` と `deleteStoredEventsByKinds` を追加する。
- Modify: `packages/resonote/src/custom-emoji.contract.test.ts`
  - source diagnostics、dedupe、invalid/missing refs、created_at、resolvedVia、sourceMode、categories 同時導出を contract test で固定する。
- Modify: `src/shared/auftakt/resonote.ts`
  - app-facing `fetchCustomEmojiSourceDiagnostics(pubkey)` と `deleteStoredEventsByKinds(kinds)` を export する。
  - custom emoji cache generation を保持し、clear 後の古い refresh storage write を破棄する。
- Modify: `src/shared/browser/emoji-sets.svelte.ts`
  - diagnostics module が source 解決済み categories を反映できる `setCustomEmojis(categories)` を追加する。
- Modify: `src/shared/browser/emoji-sets.ts`
  - `setCustomEmojis` を public wrapper から export する。
- Modify: `src/shared/browser/emoji-sets.test.ts`
  - `setCustomEmojis` と pubkey reset 時の category clear を固定する。
- Create: `src/shared/browser/custom-emoji-diagnostics.svelte.ts`
  - diagnostics state、operationVersion、refresh/clear/reset action、readonly snapshot を実装する。
- Create: `src/shared/browser/custom-emoji-diagnostics.ts`
  - public wrapper。components は `*.svelte.ts` を直接 import しない。
- Create: `src/shared/browser/custom-emoji-diagnostics.test.ts`
  - browser state、stale、operation race、clear failure、deep readonly をテストする。
- Create: `src/web/routes/settings/custom-emoji-settings-view-model.ts`
  - Settings の user-facing 文言、timestamp formatting、clear confirmation binding を pure helper として実装する。
- Create: `src/web/routes/settings/custom-emoji-settings-view-model.test.ts`
  - emptyReason/stale/timestamp/confirmation 文言をテストする。
- Create: `src/web/routes/settings/CustomEmojiSettings.svelte`
  - Settings card と Advanced reset dialog を実装する。
- Modify: `src/web/routes/settings/+page.svelte`
  - `CustomEmojiSettings` を `RelaySettings` と `MuteSettings` の近くに追加する。
- Create: `src/web/routes/settings/developer-emoji-diagnostics-view-model.ts`
  - DeveloperTools の truncated refs、copy payload、cache-only caveat を pure helper として実装する。
- Create: `src/web/routes/settings/developer-emoji-diagnostics-view-model.test.ts`
  - 20件 truncation、copy payload 全件、cache-only caveat をテストする。
- Modify: `src/web/routes/settings/DeveloperTools.svelte`
  - Emoji diagnostics block を追加し、既存 DB stats block は残す。
- Modify: `src/shared/i18n/en.json`, `src/shared/i18n/ja.json`, `src/shared/i18n/de.json`, `src/shared/i18n/es.json`, `src/shared/i18n/fr.json`, `src/shared/i18n/ko.json`, `src/shared/i18n/pt_br.json`, `src/shared/i18n/zh_cn.json`, `src/shared/i18n/ja_kyoto.json`, `src/shared/i18n/ja_osaka.json`, `src/shared/i18n/ja_villainess.json`
  - `settings.custom_emoji.*` と `dev.emoji.*` keys を全 locale に追加する。英語以外は英語 fallback ではなく短い既存調の文言を入れる。

## Task 1: Runtime Diagnostics Contract

**Files:**

- Modify: `packages/resonote/src/plugins/built-in-plugins.ts`
- Modify: `packages/resonote/src/runtime.ts`
- Modify: `packages/resonote/src/custom-emoji.contract.test.ts`

- [ ] **Step 1: Failing tests for source diagnostics**

Add tests to `packages/resonote/src/custom-emoji.contract.test.ts` below the existing three tests.

```ts
it('returns diagnostics and categories from the same custom emoji source resolution', async () => {
  const pubkey = 'user-pubkey';
  const setAuthor = 'set-author';
  const listEvent = event('emoji-list', {
    pubkey,
    kind: 10030,
    created_at: 300,
    tags: [
      ['emoji', 'wave', 'https://example.com/wave.png'],
      ['emoji', 'bad-name', 'https://example.com/bad.png'],
      ['a', `30030:${setAuthor}:cached`],
      ['a', `30030:${setAuthor}:cached`],
      ['a', '30030:missing-author:missing'],
      ['a', 'not-a-valid-ref']
    ]
  });
  const cachedSet = event('cached-set', {
    pubkey: setAuthor,
    kind: 30030,
    created_at: 400,
    tags: [
      ['d', 'cached'],
      ['title', 'Cached Set'],
      ['emoji', 'spark', 'https://example.com/spark.png'],
      ['emoji', 'spark', 'https://example.com/duplicate.png'],
      ['emoji', 'bad-name', 'https://example.com/bad.png']
    ]
  });
  const { runtime } = createEmojiRuntime({
    listEvent,
    cachedSets: { [`${setAuthor}:cached`]: cachedSet },
    fetchedSets: []
  });

  const result = await fetchCustomEmojiSourceDiagnostics(runtime, pubkey);

  expect(result.categories).toEqual([
    {
      id: 'custom-inline',
      name: 'Custom',
      emojis: [{ id: 'wave', name: 'wave', skins: [{ src: 'https://example.com/wave.png' }] }]
    },
    {
      id: 'set-cached-',
      name: 'Cached Set',
      emojis: [{ id: 'spark', name: 'spark', skins: [{ src: 'https://example.com/spark.png' }] }]
    }
  ]);
  expect(result.diagnostics.listEvent).toEqual({
    id: 'emoji-list',
    createdAtSec: 300,
    inlineEmojiCount: 1,
    referencedSetRefCount: 2
  });
  expect(result.diagnostics.sets).toEqual([
    {
      ref: `30030:${setAuthor}:cached`,
      id: 'cached-set',
      pubkey: setAuthor,
      dTag: 'cached',
      title: 'Cached Set',
      createdAtSec: 400,
      emojiCount: 1,
      resolvedVia: 'cache'
    }
  ]);
  expect(result.diagnostics.missingRefs).toEqual(['30030:missing-author:missing']);
  expect(result.diagnostics.invalidRefs).toEqual(['not-a-valid-ref']);
  expect(result.diagnostics.sourceMode).toBe('cache-only');
});
```

Add this test for empty set diagnostics:

```ts
it('keeps resolved empty emoji sets in diagnostics while categories stay empty', async () => {
  const pubkey = 'user-pubkey';
  const setAuthor = 'set-author';
  const listEvent = event('emoji-list', {
    pubkey,
    kind: 10030,
    tags: [['a', `30030:${setAuthor}:empty`]]
  });
  const emptySet = event('empty-set', {
    pubkey: setAuthor,
    kind: 30030,
    created_at: 500,
    tags: [['d', 'empty']]
  });
  const { runtime } = createEmojiRuntime({
    listEvent,
    cachedSets: { [`${setAuthor}:empty`]: emptySet }
  });

  const result = await fetchCustomEmojiSourceDiagnostics(runtime, pubkey);

  expect(result.categories).toEqual([]);
  expect(result.diagnostics.sets).toEqual([
    {
      ref: `30030:${setAuthor}:empty`,
      id: 'empty-set',
      pubkey: setAuthor,
      dTag: 'empty',
      title: 'empty',
      createdAtSec: 500,
      emojiCount: 0,
      resolvedVia: 'cache'
    }
  ]);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
pnpm exec vitest run packages/resonote/src/custom-emoji.contract.test.ts
```

Expected: FAIL with `fetchCustomEmojiSourceDiagnostics` export/import missing.

- [ ] **Step 3: Add runtime-facing types**

In `packages/resonote/src/plugins/built-in-plugins.ts`, add these types after `EmojiCategory`.

```ts
export type CustomEmojiSetResolution = 'cache' | 'relay' | 'memory' | 'unknown';
export type CustomEmojiSourceMode = 'cache-only' | 'relay-checked' | 'unknown';

export interface CustomEmojiSetDiagnosticsSource {
  ref: string;
  id: string;
  pubkey: string;
  dTag: string;
  title: string;
  createdAtSec: number;
  emojiCount: number;
  resolvedVia: CustomEmojiSetResolution;
}

export interface CustomEmojiDiagnosticsSource {
  listEvent: {
    id: string;
    createdAtSec: number;
    inlineEmojiCount: number;
    referencedSetRefCount: number;
  } | null;
  sets: CustomEmojiSetDiagnosticsSource[];
  missingRefs: string[];
  invalidRefs: string[];
  warnings: string[];
  sourceMode: CustomEmojiSourceMode;
}

export interface CustomEmojiSourceDiagnosticsResult {
  diagnostics: CustomEmojiDiagnosticsSource;
  categories: EmojiCategory[];
}
```

Extend `EmojiCatalogReadModel`:

```ts
fetchCustomEmojiSourceDiagnostics(pubkey: string): Promise<CustomEmojiSourceDiagnosticsResult>;
```

- [ ] **Step 4: Implement source parsing helpers**

In `packages/resonote/src/runtime.ts`, update imports from `built-in-plugins.js` to include the new types. Replace `extractEmojiSetRefs`, `findDTag`, `buildCategoryFromEvent`, and `buildInlineCategory` with helpers that expose diagnostics data.

Use these exact rules:

```ts
function isValidEmojiSetRef(value: string | undefined): value is string {
  if (!value) return false;
  const [kind, pubkey, dTag] = value.split(':');
  return kind === '30030' && Boolean(pubkey) && Boolean(dTag);
}

function parseEmojiSetRefs(tags: string[][]): {
  refs: string[];
  invalidRefs: string[];
} {
  const refs: string[] = [];
  const seen = new Set<string>();
  const invalidRefs: string[] = [];

  for (const tag of tags) {
    if (tag[0] !== 'a') continue;
    const value = tag[1];
    if (!isValidEmojiSetRef(value)) {
      invalidRefs.push(value ?? JSON.stringify(tag));
      continue;
    }
    if (seen.has(value)) continue;
    seen.add(value);
    refs.push(value);
  }

  return { refs, invalidRefs };
}

function findDTag(tags: string[][]): string {
  return tags.find((tag) => tag[0] === 'd')?.[1] ?? '';
}

function titleForEmojiSet(event: Pick<StoredEvent, 'id' | 'tags'>): string {
  return (
    event.tags.find((tag) => tag[0] === 'title')?.[1] ??
    event.tags.find((tag) => tag[0] === 'name')?.[1] ??
    findDTag(event.tags) ??
    event.id.slice(0, 8)
  );
}
```

Update emoji extraction so duplicate shortcode in one category keeps the first valid tag:

```ts
function buildEmojiItems(tags: string[][]): EmojiCategory['emojis'] {
  const seen = new Set<string>();
  const emojis: EmojiCategory['emojis'] = [];
  for (const tag of tags) {
    if (!isNip30EmojiTag(tag)) continue;
    if (seen.has(tag[1])) continue;
    seen.add(tag[1]);
    emojis.push({ id: tag[1], name: tag[1], skins: [{ src: tag[2] }] });
  }
  return emojis;
}
```

- [ ] **Step 5: Implement `fetchCustomEmojiSourceDiagnostics`**

Add this exported function near `fetchCustomEmojiCategories` in `packages/resonote/src/runtime.ts`.

```ts
export async function fetchCustomEmojiSourceDiagnostics(
  runtime: QueryRuntime,
  pubkey: string,
  options: {
    readonly generation?: number;
    readonly getGeneration?: () => number;
  } = {}
): Promise<CustomEmojiSourceDiagnosticsResult> {
  const eventsDB = await runtime.getEventsDB();
  const listEvent = await runtime.fetchBackwardFirst<StoredEvent>(
    [{ kinds: [10030], authors: [pubkey], limit: 1 }],
    { timeoutMs: 5_000 }
  );

  if (listEvent && options.generation === options.getGeneration?.()) {
    await cacheEvent(eventsDB, listEvent);
  } else if (listEvent && options.getGeneration === undefined) {
    await cacheEvent(eventsDB, listEvent);
  }

  if (!listEvent) {
    return {
      diagnostics: {
        listEvent: null,
        sets: [],
        missingRefs: [],
        invalidRefs: [],
        warnings: [],
        sourceMode: 'unknown'
      },
      categories: []
    };
  }

  const { refs, invalidRefs } = parseEmojiSetRefs(listEvent.tags);
  const cachedPairs = await Promise.all(
    refs.map(async (ref) => {
      const [, author, dTag] = ref.split(':');
      return { ref, event: await eventsDB.getByReplaceKey(author, 30030, dTag) };
    })
  );
  const cachedByRef = new Map(
    cachedPairs.filter((pair) => pair.event !== null).map((pair) => [pair.ref, pair.event!])
  );
  const missingBeforeRelay = refs.filter((ref) => !cachedByRef.has(ref));
  const relayFilters = missingBeforeRelay.map((ref) => {
    const [, author, dTag] = ref.split(':');
    return { kinds: [30030], authors: [author], '#d': [dTag] };
  });
  const fetchedEvents =
    relayFilters.length === 0
      ? []
      : await runtime.fetchBackwardEvents<StoredEvent>(relayFilters, { timeoutMs: 5_000 });

  if (options.generation === options.getGeneration?.() || options.getGeneration === undefined) {
    await Promise.all(fetchedEvents.map((event) => cacheEvent(eventsDB, event)));
  }

  const fetchedByRef = new Map(
    fetchedEvents.map((event) => [`30030:${event.pubkey}:${findDTag(event.tags)}`, event])
  );
  const categories: EmojiCategory[] = [];
  const inlineCategory = buildInlineCategory(listEvent);
  if (inlineCategory) categories.push(inlineCategory);

  const sets: CustomEmojiSetDiagnosticsSource[] = [];
  const missingRefs: string[] = [];
  for (const ref of refs) {
    const event = cachedByRef.get(ref) ?? fetchedByRef.get(ref) ?? null;
    if (!event) {
      missingRefs.push(ref);
      continue;
    }
    const category = buildCategoryFromEvent(event);
    if (category) categories.push(category);
    sets.push({
      ref,
      id: event.id,
      pubkey: event.pubkey,
      dTag: findDTag(event.tags),
      title: titleForEmojiSet(event),
      createdAtSec: event.created_at,
      emojiCount: buildEmojiItems(event.tags).length,
      resolvedVia: cachedByRef.has(ref) ? 'cache' : 'relay'
    });
  }

  return {
    diagnostics: {
      listEvent: {
        id: listEvent.id,
        createdAtSec: listEvent.created_at,
        inlineEmojiCount: buildEmojiItems(listEvent.tags).length,
        referencedSetRefCount: refs.length
      },
      sets,
      missingRefs,
      invalidRefs,
      warnings: [],
      sourceMode: sets.some((set) => set.resolvedVia === 'relay') ? 'relay-checked' : 'cache-only'
    },
    categories
  };
}
```

Keep `fetchCustomEmojiSources` and `fetchCustomEmojiCategories` as public compatibility wrappers, but make `fetchCustomEmojiCategories` call `fetchCustomEmojiSourceDiagnostics(runtime, pubkey).then((r) => r.categories)`.

- [ ] **Step 6: Wire coordinator and plugin read model**

In the built-in plugin registration inside `createResonoteCoordinator`, add:

```ts
fetchCustomEmojiSourceDiagnostics: (pubkey) =>
  fetchCustomEmojiSourceDiagnostics(queryRuntime, pubkey);
```

In the coordinator return object add:

```ts
fetchCustomEmojiSourceDiagnostics: (pubkey) =>
  runtimeCoordinator
    .getReadModel<EmojiCatalogReadModel>(EMOJI_CATALOG_READ_MODEL)
    .fetchCustomEmojiSourceDiagnostics(pubkey),
```

Extend the `ResonoteCoordinator` interface with:

```ts
fetchCustomEmojiSourceDiagnostics(pubkey: string): Promise<CustomEmojiSourceDiagnosticsResult>;
```

- [ ] **Step 7: Run runtime tests**

Run:

```bash
pnpm exec vitest run packages/resonote/src/custom-emoji.contract.test.ts packages/resonote/src/built-in-plugins.contract.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/resonote/src/plugins/built-in-plugins.ts packages/resonote/src/runtime.ts packages/resonote/src/custom-emoji.contract.test.ts
git commit -m "feat: add custom emoji diagnostics source"
```

## Task 2: App Facade, Kind-Limited Delete, and Storage Generation

**Files:**

- Modify: `src/shared/auftakt/resonote.ts`
- Modify: `packages/resonote/src/runtime.ts`
- Modify: `packages/resonote/src/local-store-api.contract.test.ts`

- [ ] **Step 1: Failing tests for kind-limited deletion**

Add to `packages/resonote/src/local-store-api.contract.test.ts`.

```ts
it('deletes stored events only for requested kinds', async () => {
  const deletedIds: string[] = [];
  const db = {
    getByPubkeyAndKind: vi.fn(async () => null),
    getManyByPubkeysAndKind: vi.fn(async () => []),
    getByReplaceKey: vi.fn(async () => null),
    getByTagValue: vi.fn(async () => []),
    getById: vi.fn(async () => null),
    getAllByKind: vi.fn(async (kind: number) =>
      kind === 10030
        ? [{ id: 'list', pubkey: 'pk', kind, tags: [], content: '', created_at: 1 }]
        : kind === 30030
          ? [{ id: 'set', pubkey: 'pk', kind, tags: [['d', 'x']], content: '', created_at: 1 }]
          : [{ id: 'other', pubkey: 'pk', kind, tags: [], content: '', created_at: 1 }]
    ),
    listNegentropyEventRefs: vi.fn(async () => []),
    deleteByIds: vi.fn(async (ids: string[]) => {
      deletedIds.push(...ids);
    }),
    clearAll: vi.fn(async () => undefined),
    put: vi.fn(async () => true),
    putWithReconcile: vi.fn(async () => ({ stored: true, emissions: [] }))
  };
  const coordinator = createResonoteCoordinator({
    runtime: { ...runtime, getEventsDB: async () => db }
  });

  await coordinator.deleteStoredEventsByKinds([10030, 30030]);

  expect(deletedIds.sort()).toEqual(['list', 'set']);
  expect(db.clearAll).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
pnpm exec vitest run packages/resonote/src/local-store-api.contract.test.ts
```

Expected: FAIL with `deleteStoredEventsByKinds` missing.

- [ ] **Step 3: Add coordinator API**

In `packages/resonote/src/runtime.ts`, add to the coordinator interface:

```ts
deleteStoredEventsByKinds(kinds: readonly number[]): Promise<void>;
```

Add to the returned coordinator object near `clearStoredEvents`:

```ts
deleteStoredEventsByKinds: async (kinds) => {
  const db = await runtime.getEventsDB();
  const events = (await Promise.all(kinds.map((kind) => db.getAllByKind(kind)))).flat();
  await db.deleteByIds([...new Set(events.map((event) => event.id))]);
},
```

- [ ] **Step 4: Add app facade generation**

In `src/shared/auftakt/resonote.ts`, import and export the new types from `@auftakt/resonote`. Add module state:

```ts
let customEmojiCacheGeneration = 0;

export function getCustomEmojiCacheGeneration(): number {
  return customEmojiCacheGeneration;
}
```

Add app-facing functions:

```ts
export async function fetchCustomEmojiSourceDiagnostics(pubkey: string) {
  const generation = customEmojiCacheGeneration;
  return coordinator.fetchCustomEmojiSourceDiagnostics(pubkey, {
    generation,
    getGeneration: () => customEmojiCacheGeneration
  });
}

export async function deleteStoredEventsByKinds(kinds: readonly number[]): Promise<void> {
  if (kinds.includes(10030) || kinds.includes(30030)) {
    customEmojiCacheGeneration++;
  }
  await coordinator.deleteStoredEventsByKinds(kinds);
}
```

Pass the optional generation guard through `packages/resonote/src/runtime.ts` and `EmojiCatalogReadModel` in the same change:

```ts
fetchCustomEmojiSourceDiagnostics(
  pubkey: string,
  options?: {
    readonly generation?: number;
    readonly getGeneration?: () => number;
  }
): Promise<CustomEmojiSourceDiagnosticsResult>;
```

- [ ] **Step 5: Add facade tests to the browser-facing layer**

Add tests in `src/shared/browser/custom-emoji-diagnostics.test.ts` in Task 4 rather than here. This keeps app facade generation observable through browser behavior.

- [ ] **Step 6: Run focused tests**

Run:

```bash
pnpm exec vitest run packages/resonote/src/local-store-api.contract.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/resonote/src/runtime.ts packages/resonote/src/local-store-api.contract.test.ts src/shared/auftakt/resonote.ts
git commit -m "feat: add custom emoji cache deletion facade"
```

## Task 3: Emoji Sets Mutation API

**Files:**

- Modify: `src/shared/browser/emoji-sets.svelte.ts`
- Modify: `src/shared/browser/emoji-sets.ts`
- Modify: `src/shared/browser/emoji-sets.test.ts`

- [ ] **Step 1: Failing tests**

Add to `src/shared/browser/emoji-sets.test.ts`.

```ts
describe('setCustomEmojis', () => {
  beforeEach(() => {
    clearCustomEmojis();
    vi.clearAllMocks();
  });

  it('replaces categories without fetching', () => {
    setCustomEmojis([makeCategory('custom-inline', 'wave')]);

    expect(getCustomEmojis().categories).toEqual([makeCategory('custom-inline', 'wave')]);
    expect(fetchCustomEmojiCategoriesMock).not.toHaveBeenCalled();
  });

  it('cancels an in-flight load when diagnostics replaces categories', async () => {
    let resolveLoad: (categories: unknown[]) => void = () => {};
    fetchCustomEmojiCategoriesMock.mockImplementation(
      () => new Promise((resolve) => (resolveLoad = resolve))
    );

    const load = loadCustomEmojis(PUBKEY);
    setCustomEmojis([makeCategory('diagnostics', 'spark')]);
    resolveLoad([makeCategory('late', 'old')]);
    await load;

    expect(getCustomEmojis().categories).toEqual([makeCategory('diagnostics', 'spark')]);
    expect(getCustomEmojis().loading).toBe(false);
  });
});
```

Update import:

```ts
import {
  clearCustomEmojis,
  getCustomEmojis,
  loadCustomEmojis,
  setCustomEmojis
} from './emoji-sets.svelte.js';
```

- [ ] **Step 2: Run test and verify failure**

```bash
pnpm exec vitest run src/shared/browser/emoji-sets.test.ts
```

Expected: FAIL with `setCustomEmojis` missing.

- [ ] **Step 3: Implement `setCustomEmojis`**

In `src/shared/browser/emoji-sets.svelte.ts`:

```ts
export function setCustomEmojis(categories: readonly EmojiCategory[]): void {
  log.info('Setting custom emojis from resolved diagnostics', {
    categoryCount: categories.length,
    totalEmojis: categories.reduce((sum, category) => sum + category.emojis.length, 0)
  });
  ++generation;
  customEmojis = categories.map((category) => ({
    ...category,
    emojis: category.emojis.map((emoji) => ({
      ...emoji,
      skins: emoji.skins.map((skin) => ({ ...skin }))
    }))
  }));
  loading = false;
}
```

Export it from `src/shared/browser/emoji-sets.ts`:

```ts
export {
  clearCustomEmojis,
  getCustomEmojis,
  loadCustomEmojis,
  setCustomEmojis
} from './emoji-sets.svelte.js';
```

- [ ] **Step 4: Run focused test**

```bash
pnpm exec vitest run src/shared/browser/emoji-sets.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/browser/emoji-sets.svelte.ts src/shared/browser/emoji-sets.ts src/shared/browser/emoji-sets.test.ts
git commit -m "feat: allow resolved custom emoji categories"
```

## Task 4: Browser Diagnostics State

**Files:**

- Create: `src/shared/browser/custom-emoji-diagnostics.svelte.ts`
- Create: `src/shared/browser/custom-emoji-diagnostics.ts`
- Create: `src/shared/browser/custom-emoji-diagnostics.test.ts`

- [ ] **Step 1: Write failing browser state tests**

Create `src/shared/browser/custom-emoji-diagnostics.test.ts` with these initial tests. Keep mocks at top level using `vi.hoisted`.

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  fetchDiagnosticsMock,
  deleteStoredEventsByKindsMock,
  setCustomEmojisMock,
  clearCustomEmojisMock
} = vi.hoisted(() => ({
  fetchDiagnosticsMock: vi.fn(),
  deleteStoredEventsByKindsMock: vi.fn(),
  setCustomEmojisMock: vi.fn(),
  clearCustomEmojisMock: vi.fn()
}));

vi.mock('$shared/auftakt/resonote.js', () => ({
  fetchCustomEmojiSourceDiagnostics: fetchDiagnosticsMock,
  deleteStoredEventsByKinds: deleteStoredEventsByKindsMock
}));

vi.mock('$shared/browser/emoji-sets.js', () => ({
  setCustomEmojis: setCustomEmojisMock,
  clearCustomEmojis: clearCustomEmojisMock
}));

import {
  clearCustomEmojiCache,
  getCustomEmojiDiagnostics,
  refreshCustomEmojiDiagnostics,
  resetCustomEmojiDiagnosticsForPubkey
} from './custom-emoji-diagnostics.svelte.js';

const PUBKEY = 'p'.repeat(64);

function result(overrides = {}) {
  return {
    diagnostics: {
      listEvent: { id: 'list', createdAtSec: 100, inlineEmojiCount: 1, referencedSetRefCount: 1 },
      sets: [
        {
          ref: `30030:${PUBKEY}:set`,
          id: 'set-event',
          pubkey: PUBKEY,
          dTag: 'set',
          title: 'Set',
          createdAtSec: 120,
          emojiCount: 1,
          resolvedVia: 'relay'
        }
      ],
      missingRefs: [],
      invalidRefs: [],
      warnings: [],
      sourceMode: 'relay-checked',
      ...overrides
    },
    categories: [
      {
        id: 'custom-inline',
        name: 'Custom',
        emojis: [{ id: 'wave', name: 'wave', skins: [{ src: 'https://example.com/wave.png' }] }]
      }
    ]
  };
}

describe('custom emoji diagnostics browser state', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.setSystemTime(new Date('2026-05-05T00:00:00.000Z'));
    fetchDiagnosticsMock.mockReset();
    deleteStoredEventsByKindsMock.mockReset();
    setCustomEmojisMock.mockReset();
    clearCustomEmojisMock.mockReset();
    resetCustomEmojiDiagnosticsForPubkey(null);
  });

  it('refresh success updates diagnostics and emoji categories from the same result', async () => {
    resetCustomEmojiDiagnosticsForPubkey(PUBKEY);
    fetchDiagnosticsMock.mockResolvedValue(result());

    await refreshCustomEmojiDiagnostics(PUBKEY);

    const state = getCustomEmojiDiagnostics();
    expect(state.status).toBe('ready');
    expect(state.pubkey).toBe(PUBKEY);
    expect(state.summary).toEqual({ categoryCount: 1, emojiCount: 1 });
    expect(state.lastCheckedAtMs).toBe(Date.parse('2026-05-05T00:00:00.000Z'));
    expect(state.lastSuccessfulAtMs).toBe(Date.parse('2026-05-05T00:00:00.000Z'));
    expect(setCustomEmojisMock).toHaveBeenCalledWith(result().categories);
  });

  it('refresh failure keeps previous diagnostics and marks stale', async () => {
    resetCustomEmojiDiagnosticsForPubkey(PUBKEY);
    fetchDiagnosticsMock.mockResolvedValueOnce(result());
    await refreshCustomEmojiDiagnostics(PUBKEY);
    vi.setSystemTime(new Date('2026-05-05T00:01:00.000Z'));
    fetchDiagnosticsMock.mockRejectedValueOnce(new Error('network down'));

    await refreshCustomEmojiDiagnostics(PUBKEY);

    const state = getCustomEmojiDiagnostics();
    expect(state.status).toBe('error');
    expect(state.stale).toBe(true);
    expect(state.summary).toEqual({ categoryCount: 1, emojiCount: 1 });
    expect(state.lastCheckedAtMs).toBe(Date.parse('2026-05-05T00:01:00.000Z'));
    expect(state.lastSuccessfulAtMs).toBe(Date.parse('2026-05-05T00:00:00.000Z'));
    expect(setCustomEmojisMock).toHaveBeenCalledTimes(1);
  });

  it('clear success resets state and clears categories', async () => {
    resetCustomEmojiDiagnosticsForPubkey(PUBKEY);
    fetchDiagnosticsMock.mockResolvedValue(result());
    await refreshCustomEmojiDiagnostics(PUBKEY);
    deleteStoredEventsByKindsMock.mockResolvedValue(undefined);

    await clearCustomEmojiCache();

    const state = getCustomEmojiDiagnostics();
    expect(deleteStoredEventsByKindsMock).toHaveBeenCalledWith([10030, 30030]);
    expect(clearCustomEmojisMock).toHaveBeenCalledOnce();
    expect(state.pubkey).toBe(PUBKEY);
    expect(state.status).toBe('idle');
    expect(state.dbCounts).toEqual({ kind10030: 0, kind30030: 0 });
    expect(state.lastCheckedAtMs).toBeNull();
  });

  it('does not allow refresh while clear is active', async () => {
    resetCustomEmojiDiagnosticsForPubkey(PUBKEY);
    deleteStoredEventsByKindsMock.mockImplementation(() => new Promise(() => {}));

    void clearCustomEmojiCache();

    await expect(refreshCustomEmojiDiagnostics(PUBKEY)).rejects.toThrow(
      'Cannot refresh while clearing custom emoji cache'
    );
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

```bash
pnpm exec vitest run src/shared/browser/custom-emoji-diagnostics.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement diagnostics state module**

Create `src/shared/browser/custom-emoji-diagnostics.svelte.ts`. Use this structure:

```ts
import {
  deleteStoredEventsByKinds,
  fetchCustomEmojiSourceDiagnostics,
  type CustomEmojiDiagnosticsSource,
  type EmojiCategory
} from '$shared/auftakt/resonote.js';
import { clearCustomEmojis, setCustomEmojis } from './emoji-sets.js';

export type CustomEmojiDiagnosticStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';
export type CustomEmojiEmptyReason =
  | 'no-list-event'
  | 'no-emoji-sources'
  | 'only-invalid-set-refs'
  | 'all-set-refs-missing'
  | 'resolved-sets-empty'
  | 'no-valid-emoji';

export interface CustomEmojiDiagnostics {
  pubkey: string | null;
  requestId: number;
  status: CustomEmojiDiagnosticStatus;
  isRefreshing: boolean;
  isClearing: boolean;
  emptyReason: CustomEmojiEmptyReason | null;
  lastCheckedAtMs: number | null;
  lastSuccessfulAtMs: number | null;
  dbCounts: { kind10030: number; kind30030: number };
  summary: { categoryCount: number; emojiCount: number };
  listEvent: CustomEmojiDiagnosticsSource['listEvent'];
  sets: CustomEmojiDiagnosticsSource['sets'];
  missingRefs: readonly string[];
  invalidRefs: readonly string[];
  warnings: readonly string[];
  sourceMode: CustomEmojiDiagnosticsSource['sourceMode'];
  error: string | null;
  stale: boolean;
}

const emptySource = {
  listEvent: null,
  sets: [],
  missingRefs: [],
  invalidRefs: [],
  warnings: [],
  sourceMode: 'unknown' as const
};

let operationVersion = 0;
let state = $state<CustomEmojiDiagnostics>({
  pubkey: null,
  requestId: 0,
  status: 'idle',
  isRefreshing: false,
  isClearing: false,
  emptyReason: null,
  lastCheckedAtMs: null,
  lastSuccessfulAtMs: null,
  dbCounts: { kind10030: 0, kind30030: 0 },
  summary: { categoryCount: 0, emojiCount: 0 },
  ...emptySource,
  error: null,
  stale: false
});
```

Implement helpers:

```ts
function cloneCategories(categories: readonly EmojiCategory[]): EmojiCategory[] {
  return categories.map((category) => ({
    ...category,
    emojis: category.emojis.map((emoji) => ({
      ...emoji,
      skins: emoji.skins.map((skin) => ({ ...skin }))
    }))
  }));
}

function summarize(categories: readonly EmojiCategory[]) {
  return {
    categoryCount: categories.length,
    emojiCount: categories.reduce((sum, category) => sum + category.emojis.length, 0)
  };
}

function emptyReasonFor(
  source: CustomEmojiDiagnosticsSource,
  categories: readonly EmojiCategory[]
) {
  const totalEmojiCount = summarize(categories).emojiCount;
  if (!source.listEvent) return 'no-list-event';
  if (totalEmojiCount > 0) return null;
  const validInlineEmojiCount = source.listEvent.inlineEmojiCount;
  const validSetRefCount = source.listEvent.referencedSetRefCount;
  const resolvedSetCount = source.sets.length;
  const resolvedSetEmojiCount = source.sets.reduce((sum, set) => sum + set.emojiCount, 0);
  if (validInlineEmojiCount === 0 && validSetRefCount === 0 && source.invalidRefs.length > 0) {
    return 'only-invalid-set-refs';
  }
  if (validInlineEmojiCount === 0 && validSetRefCount === 0) return 'no-emoji-sources';
  if (
    validSetRefCount > 0 &&
    resolvedSetCount === 0 &&
    source.missingRefs.length === validSetRefCount
  ) {
    return 'all-set-refs-missing';
  }
  if (resolvedSetCount > 0 && resolvedSetEmojiCount === 0) return 'resolved-sets-empty';
  return 'no-valid-emoji';
}
```

Implement operations:

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

export function resetCustomEmojiDiagnosticsForPubkey(pubkey: string | null): void {
  ++operationVersion;
  state = {
    ...state,
    pubkey,
    requestId: operationVersion,
    status: 'idle',
    isRefreshing: false,
    isClearing: false,
    emptyReason: null,
    lastCheckedAtMs: null,
    lastSuccessfulAtMs: null,
    dbCounts: { kind10030: 0, kind30030: 0 },
    summary: { categoryCount: 0, emojiCount: 0 },
    ...emptySource,
    error: null,
    stale: false
  };
  clearCustomEmojis();
}

export async function refreshCustomEmojiDiagnostics(pubkey: string): Promise<void> {
  const version = startOperation('refresh');
  const checkedAt = Date.now();
  if (state.status === 'idle') state.status = 'loading';
  state.pubkey = pubkey;
  try {
    const result = await fetchCustomEmojiSourceDiagnostics(pubkey);
    if (version !== operationVersion || state.pubkey !== pubkey) return;
    const categories = cloneCategories(result.categories);
    const summary = summarize(categories);
    const emptyReason = emptyReasonFor(result.diagnostics, categories);
    state = {
      ...state,
      pubkey,
      status: emptyReason ? 'empty' : 'ready',
      isRefreshing: false,
      emptyReason,
      lastCheckedAtMs: checkedAt,
      lastSuccessfulAtMs: checkedAt,
      summary,
      ...result.diagnostics,
      error: null,
      stale: false
    };
    setCustomEmojis(categories);
  } catch (error) {
    if (version !== operationVersion) return;
    state = {
      ...state,
      status: 'error',
      isRefreshing: false,
      lastCheckedAtMs: checkedAt,
      error: error instanceof Error ? error.message : String(error),
      stale: state.lastSuccessfulAtMs !== null
    };
  } finally {
    if (version === operationVersion) state.isRefreshing = false;
  }
}

export async function clearCustomEmojiCache(): Promise<void> {
  const version = startOperation('clear');
  try {
    await deleteStoredEventsByKinds([10030, 30030]);
    if (version !== operationVersion) return;
    clearCustomEmojis();
    state = {
      ...state,
      status: 'idle',
      isClearing: false,
      emptyReason: null,
      lastCheckedAtMs: null,
      lastSuccessfulAtMs: null,
      dbCounts: { kind10030: 0, kind30030: 0 },
      summary: { categoryCount: 0, emojiCount: 0 },
      ...emptySource,
      error: null,
      stale: false
    };
  } catch (error) {
    if (version === operationVersion) {
      state = {
        ...state,
        isClearing: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
    throw error;
  } finally {
    if (version === operationVersion) state.isClearing = false;
  }
}
```

Return a deep readonly snapshot:

```ts
export function getCustomEmojiDiagnostics(): Readonly<CustomEmojiDiagnostics> {
  return {
    ...state,
    dbCounts: { ...state.dbCounts },
    summary: { ...state.summary },
    listEvent: state.listEvent ? { ...state.listEvent } : null,
    sets: state.sets.map((set) => ({ ...set })),
    missingRefs: [...state.missingRefs],
    invalidRefs: [...state.invalidRefs],
    warnings: [...state.warnings]
  };
}
```

- [ ] **Step 4: Add public wrapper**

Create `src/shared/browser/custom-emoji-diagnostics.ts`:

```ts
// @public — Stable API for route/component consumers
export {
  clearCustomEmojiCache,
  getCustomEmojiDiagnostics,
  refreshCustomEmojiDiagnostics,
  resetCustomEmojiDiagnosticsForPubkey,
  type CustomEmojiDiagnostics
} from './custom-emoji-diagnostics.svelte.js';
```

- [ ] **Step 5: Run tests**

```bash
pnpm exec vitest run src/shared/browser/custom-emoji-diagnostics.test.ts src/shared/browser/emoji-sets.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/shared/browser/custom-emoji-diagnostics.svelte.ts src/shared/browser/custom-emoji-diagnostics.ts src/shared/browser/custom-emoji-diagnostics.test.ts
git commit -m "feat: add custom emoji diagnostics state"
```

## Task 5: Settings Custom Emoji Card

**Files:**

- Create: `src/web/routes/settings/custom-emoji-settings-view-model.ts`
- Create: `src/web/routes/settings/custom-emoji-settings-view-model.test.ts`
- Create: `src/web/routes/settings/CustomEmojiSettings.svelte`
- Modify: `src/web/routes/settings/+page.svelte`
- Modify: all `src/shared/i18n/*.json`

- [ ] **Step 1: Failing view-model tests**

Create `src/web/routes/settings/custom-emoji-settings-view-model.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  clearCustomEmojiCacheMessage,
  customEmojiStatusMessage,
  formatAppTimestampMs,
  formatNostrTimestampSec
} from './custom-emoji-settings-view-model.js';

describe('custom emoji settings view model', () => {
  it('formats Nostr seconds separately from app milliseconds', () => {
    expect(formatNostrTimestampSec(1777939200)).toContain('2026');
    expect(formatAppTimestampMs(1777939200000)).toContain('2026');
  });

  it('uses stale copy for previous emoji categories', () => {
    expect(
      customEmojiStatusMessage({
        status: 'error',
        stale: true,
        summary: { categoryCount: 1, emojiCount: 2 },
        emptyReason: null,
        error: 'fetch failed'
      })
    ).toBe('Refresh failed. Using previously loaded custom emoji.');
  });

  it('uses stale copy for previous empty diagnostics', () => {
    expect(
      customEmojiStatusMessage({
        status: 'error',
        stale: true,
        summary: { categoryCount: 0, emojiCount: 0 },
        emptyReason: 'no-list-event',
        error: 'fetch failed'
      })
    ).toBe('Refresh failed. Showing the previous diagnostics result.');
  });

  it('contains all required clear cache warnings', () => {
    expect(clearCustomEmojiCacheMessage()).toContain('all accounts');
    expect(clearCustomEmojiCacheMessage()).toContain('locally cached');
    expect(clearCustomEmojiCacheMessage()).toContain('published Nostr events will not be deleted');
  });
});
```

- [ ] **Step 2: Run test and verify failure**

```bash
pnpm exec vitest run src/web/routes/settings/custom-emoji-settings-view-model.test.ts
```

Expected: FAIL because helper module does not exist.

- [ ] **Step 3: Implement view-model helper**

Create `src/web/routes/settings/custom-emoji-settings-view-model.ts`:

```ts
import type {
  CustomEmojiDiagnostics,
  CustomEmojiEmptyReason
} from '$shared/browser/custom-emoji-diagnostics.js';

export function formatNostrTimestampSec(createdAtSec: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(createdAtSec * 1000));
}

export function formatAppTimestampMs(timestampMs: number | null): string {
  if (timestampMs === null) return 'Not checked yet';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(timestampMs));
}

function emptyReasonMessage(reason: CustomEmojiEmptyReason | null): string {
  switch (reason) {
    case 'no-list-event':
      return 'No custom emoji list found.';
    case 'no-emoji-sources':
      return 'Custom emoji list found, but it does not contain emoji sources.';
    case 'only-invalid-set-refs':
      return 'Custom emoji list found, but its emoji set references are invalid.';
    case 'all-set-refs-missing':
      return 'Custom emoji list found, but referenced emoji sets could not be resolved.';
    case 'resolved-sets-empty':
      return 'Emoji sets were resolved, but they contain no valid emoji.';
    case 'no-valid-emoji':
      return 'No valid custom emoji found.';
    default:
      return 'No custom emoji diagnostics yet.';
  }
}

export function customEmojiStatusMessage(
  input: Pick<CustomEmojiDiagnostics, 'status' | 'stale' | 'summary' | 'emptyReason' | 'error'>
): string {
  if (input.status === 'ready') return 'Custom emoji list found.';
  if (input.status === 'empty') return emptyReasonMessage(input.emptyReason);
  if (input.status === 'loading') return 'Loading custom emoji diagnostics...';
  if (input.status === 'error' && input.stale && input.summary.emojiCount > 0) {
    return 'Refresh failed. Using previously loaded custom emoji.';
  }
  if (input.status === 'error' && input.stale) {
    return 'Refresh failed. Showing the previous diagnostics result.';
  }
  if (input.status === 'error') return input.error ?? 'Failed to refresh custom emoji.';
  return 'Not checked yet.';
}

export function clearCustomEmojiCacheMessage(): string {
  return [
    'This deletes locally cached custom emoji lists and emoji sets for all accounts on this device.',
    'Your published Nostr events will not be deleted.',
    'You may need to refresh custom emoji again after this.'
  ].join('\n');
}
```

- [ ] **Step 4: Add i18n keys**

Add these keys to `src/shared/i18n/en.json`; mirror them in every other locale file with equivalent short strings:

```json
"settings.custom_emoji.title": "Custom emoji",
"settings.custom_emoji.refresh": "Refresh",
"settings.custom_emoji.refreshing": "Refreshing...",
"settings.custom_emoji.not_logged_in": "Login to check custom emoji status.",
"settings.custom_emoji.advanced": "Advanced",
"settings.custom_emoji.reset_cache": "Reset local custom emoji cache...",
"settings.custom_emoji.reset_title": "Reset custom emoji cache",
"settings.custom_emoji.reset_confirm": "Reset cache",
"settings.custom_emoji.reset_message": "This deletes locally cached custom emoji lists and emoji sets for all accounts on this device.\nYour published Nostr events will not be deleted.\nYou may need to refresh custom emoji again after this.",
"settings.custom_emoji.list_updated": "List updated",
"settings.custom_emoji.last_checked": "Last checked",
"settings.custom_emoji.emoji_sets": "Emoji sets: {count}",
"settings.custom_emoji.emojis": "Emojis: {count}"
```

- [ ] **Step 5: Implement Svelte card**

Create `src/web/routes/settings/CustomEmojiSettings.svelte`. Keep the component user-facing; do not render missing refs here.

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
  import { getAuth } from '$shared/browser/auth.js';
  import {
    clearCustomEmojiCache,
    getCustomEmojiDiagnostics,
    refreshCustomEmojiDiagnostics,
    resetCustomEmojiDiagnosticsForPubkey
  } from '$shared/browser/custom-emoji-diagnostics.js';
  import { t } from '$shared/i18n/t.js';
  import {
    customEmojiStatusMessage,
    formatAppTimestampMs,
    formatNostrTimestampSec
  } from './custom-emoji-settings-view-model.js';

  const auth = getAuth();
  let diagnostics = $derived(getCustomEmojiDiagnostics());
  let confirmClear = $state(false);
  let clearError = $state<string | null>(null);

  $effect(() => {
    resetCustomEmojiDiagnosticsForPubkey(auth.pubkey);
  });

  onMount(() => {
    if (auth.pubkey) void refreshCustomEmojiDiagnostics(auth.pubkey);
  });

  async function handleRefresh() {
    if (!auth.pubkey) return;
    await refreshCustomEmojiDiagnostics(auth.pubkey);
  }

  async function handleClear() {
    clearError = null;
    try {
      await clearCustomEmojiCache();
      confirmClear = false;
    } catch (error) {
      clearError = error instanceof Error ? error.message : String(error);
    }
  }
</script>

<section class="rounded-2xl border border-border bg-surface-1 p-6 space-y-5">
  <div class="flex items-center justify-between gap-3">
    <h2 class="font-display text-lg font-semibold text-text-primary">
      {t('settings.custom_emoji.title')}
    </h2>
    {#if auth.pubkey}
      <button
        type="button"
        onclick={handleRefresh}
        disabled={diagnostics.isRefreshing || diagnostics.isClearing}
        class="rounded-lg bg-surface-2 px-3 py-1.5 text-xs text-text-muted transition-colors hover:bg-surface-3 hover:text-text-secondary disabled:opacity-50"
      >
        {diagnostics.isRefreshing
          ? t('settings.custom_emoji.refreshing')
          : t('settings.custom_emoji.refresh')}
      </button>
    {/if}
  </div>

  {#if !auth.pubkey}
    <p class="text-sm text-text-muted">{t('settings.custom_emoji.not_logged_in')}</p>
  {:else}
    <p class="text-sm text-text-muted">{customEmojiStatusMessage(diagnostics)}</p>
    <div class="grid grid-cols-2 gap-2 text-xs text-text-muted">
      <span
        >{t('settings.custom_emoji.emoji_sets', { count: diagnostics.summary.categoryCount })}</span
      >
      <span>{t('settings.custom_emoji.emojis', { count: diagnostics.summary.emojiCount })}</span>
      {#if diagnostics.listEvent}
        <span>{t('settings.custom_emoji.list_updated')}</span>
        <span>{formatNostrTimestampSec(diagnostics.listEvent.createdAtSec)}</span>
      {/if}
      <span>{t('settings.custom_emoji.last_checked')}</span>
      <span>{formatAppTimestampMs(diagnostics.lastCheckedAtMs)}</span>
    </div>
  {/if}

  <div class="border-t border-border-subtle pt-3">
    <h3 class="text-sm font-medium text-text-secondary">{t('settings.custom_emoji.advanced')}</h3>
    <button
      type="button"
      onclick={() => (confirmClear = true)}
      disabled={diagnostics.isClearing}
      class="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50"
    >
      {t('settings.custom_emoji.reset_cache')}
    </button>
  </div>
</section>

<ConfirmDialog
  open={confirmClear}
  title={t('settings.custom_emoji.reset_title')}
  message={clearError ?? t('settings.custom_emoji.reset_message')}
  variant="danger"
  confirmLabel={t('settings.custom_emoji.reset_confirm')}
  cancelLabel={t('confirm.cancel')}
  onConfirm={handleClear}
  onCancel={() => (confirmClear = false)}
/>
```

- [ ] **Step 6: Wire into settings page**

In `src/web/routes/settings/+page.svelte`, add:

```ts
import CustomEmojiSettings from './CustomEmojiSettings.svelte';
```

Render it between `MuteSettings` and notification filter:

```svelte
<CustomEmojiSettings />
```

- [ ] **Step 7: Run tests/check**

```bash
pnpm exec vitest run src/web/routes/settings/custom-emoji-settings-view-model.test.ts
pnpm run check
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/web/routes/settings/custom-emoji-settings-view-model.ts src/web/routes/settings/custom-emoji-settings-view-model.test.ts src/web/routes/settings/CustomEmojiSettings.svelte src/web/routes/settings/+page.svelte src/shared/i18n/*.json
git commit -m "feat: show custom emoji diagnostics in settings"
```

## Task 6: DeveloperTools Emoji Diagnostics

**Files:**

- Create: `src/web/routes/settings/developer-emoji-diagnostics-view-model.ts`
- Create: `src/web/routes/settings/developer-emoji-diagnostics-view-model.test.ts`
- Modify: `src/web/routes/settings/DeveloperTools.svelte`
- Modify: all `src/shared/i18n/*.json`

- [ ] **Step 1: Failing helper tests**

Create `src/web/routes/settings/developer-emoji-diagnostics-view-model.test.ts`.

```ts
import { describe, expect, it } from 'vitest';
import {
  buildEmojiDiagnosticsCopyPayload,
  cacheOnlyCaveat,
  truncateRefs
} from './developer-emoji-diagnostics-view-model.js';

describe('developer emoji diagnostics view model', () => {
  it('shows only the first 20 refs while preserving total count', () => {
    const refs = Array.from({ length: 25 }, (_, index) => `30030:pubkey:set-${index}`);

    expect(truncateRefs(refs)).toEqual({
      visible: refs.slice(0, 20),
      hiddenCount: 5
    });
  });

  it('copy payload includes every missing and invalid ref', () => {
    const payload = buildEmojiDiagnosticsCopyPayload({
      missingRefs: ['missing-1', 'missing-2'],
      invalidRefs: ['invalid-1'],
      sets: [],
      sourceMode: 'cache-only',
      warnings: ['relay failed']
    });

    expect(payload).toContain('missing-1');
    expect(payload).toContain('missing-2');
    expect(payload).toContain('invalid-1');
    expect(payload).toContain('relay failed');
  });

  it('shows cache-only caveat when unresolved refs exist', () => {
    expect(cacheOnlyCaveat('cache-only', ['missing'])).toBe(
      'Some refs were unresolved in local sources. Relay existence was not verified.'
    );
    expect(cacheOnlyCaveat('relay-checked', ['missing'])).toBeNull();
  });
});
```

- [ ] **Step 2: Run test and verify failure**

```bash
pnpm exec vitest run src/web/routes/settings/developer-emoji-diagnostics-view-model.test.ts
```

Expected: FAIL because module does not exist.

- [ ] **Step 3: Implement DeveloperTools helper**

Create `src/web/routes/settings/developer-emoji-diagnostics-view-model.ts`:

```ts
import type { CustomEmojiDiagnostics } from '$shared/browser/custom-emoji-diagnostics.js';

export function truncateRefs(refs: readonly string[], limit = 20) {
  return {
    visible: refs.slice(0, limit),
    hiddenCount: Math.max(0, refs.length - limit)
  };
}

export function cacheOnlyCaveat(
  sourceMode: CustomEmojiDiagnostics['sourceMode'],
  unresolvedRefs: readonly string[]
): string | null {
  if (sourceMode !== 'cache-only' || unresolvedRefs.length === 0) return null;
  return 'Some refs were unresolved in local sources. Relay existence was not verified.';
}

export function buildEmojiDiagnosticsCopyPayload(
  input: Pick<
    CustomEmojiDiagnostics,
    'missingRefs' | 'invalidRefs' | 'sets' | 'sourceMode' | 'warnings'
  >
): string {
  return JSON.stringify(
    {
      sourceMode: input.sourceMode,
      sets: input.sets,
      missingRefs: input.missingRefs,
      invalidRefs: input.invalidRefs,
      warnings: input.warnings
    },
    null,
    2
  );
}
```

- [ ] **Step 4: Add i18n keys**

Add these to `en.json` and equivalent short strings to every locale file:

```json
"dev.emoji.title": "Emoji diagnostics",
"dev.emoji.db_counts": "DB counts",
"dev.emoji.list_event": "kind:10030 list event",
"dev.emoji.sets": "kind:30030 sets",
"dev.emoji.missing_refs": "Missing refs",
"dev.emoji.invalid_refs": "Invalid refs",
"dev.emoji.copy": "Copy diagnostics",
"dev.emoji.copied": "Copied",
"dev.emoji.cache_only_caveat": "Some refs were unresolved in local sources. Relay existence was not verified."
```

- [ ] **Step 5: Add block to `DeveloperTools.svelte`**

Import diagnostics and helper:

```ts
import { getCustomEmojiDiagnostics } from '$shared/browser/custom-emoji-diagnostics.js';
import {
  buildEmojiDiagnosticsCopyPayload,
  cacheOnlyCaveat,
  truncateRefs
} from './developer-emoji-diagnostics-view-model.js';

const emojiDiagnostics = $derived(getCustomEmojiDiagnostics());
let emojiDebugCopied = $state(false);
let visibleMissingRefs = $derived(truncateRefs(emojiDiagnostics.missingRefs));
let visibleInvalidRefs = $derived(truncateRefs(emojiDiagnostics.invalidRefs));
let emojiCaveat = $derived(
  cacheOnlyCaveat(emojiDiagnostics.sourceMode, emojiDiagnostics.missingRefs)
);

async function copyEmojiDiagnostics() {
  const ok = await copyToClipboard(buildEmojiDiagnosticsCopyPayload(emojiDiagnostics));
  if (ok) {
    emojiDebugCopied = true;
    setTimeout(() => {
      emojiDebugCopied = false;
    }, 2000);
  }
}
```

Add a new block after the existing DB stats block:

```svelte
<div class="space-y-2">
  <div class="flex items-center justify-between gap-3">
    <h3 class="text-sm font-medium text-text-secondary">{t('dev.emoji.title')}</h3>
    <button
      type="button"
      onclick={copyEmojiDiagnostics}
      class="rounded-lg bg-surface-2 px-3 py-1.5 text-xs text-text-muted transition-colors hover:bg-surface-3 hover:text-text-secondary"
    >
      {emojiDebugCopied ? t('dev.emoji.copied') : t('dev.emoji.copy')}
    </button>
  </div>
  <div class="grid grid-cols-2 gap-2 text-xs text-text-muted">
    <span>kind:10030</span>
    <span class="font-mono text-text-primary">{emojiDiagnostics.dbCounts.kind10030}</span>
    <span>kind:30030</span>
    <span class="font-mono text-text-primary">{emojiDiagnostics.dbCounts.kind30030}</span>
    <span>categories</span>
    <span class="font-mono text-text-primary">{emojiDiagnostics.summary.categoryCount}</span>
    <span>emojis</span>
    <span class="font-mono text-text-primary">{emojiDiagnostics.summary.emojiCount}</span>
  </div>
  {#if emojiDiagnostics.listEvent}
    <div class="text-xs text-text-muted">
      <div>
        {t('dev.emoji.list_event')}: <span class="font-mono">{emojiDiagnostics.listEvent.id}</span>
      </div>
      <div>
        created_at: <span class="font-mono">{emojiDiagnostics.listEvent.createdAtSec}</span>
      </div>
      <div>inline emoji: {emojiDiagnostics.listEvent.inlineEmojiCount}</div>
      <div>referenced sets: {emojiDiagnostics.listEvent.referencedSetRefCount}</div>
    </div>
  {/if}
  {#if emojiDiagnostics.sets.length > 0}
    <details class="text-xs text-text-muted">
      <summary>{t('dev.emoji.sets')} ({emojiDiagnostics.sets.length})</summary>
      <div class="mt-2 space-y-2">
        {#each emojiDiagnostics.sets as set (set.ref)}
          <div class="rounded-lg bg-surface-2 p-2">
            <div class="font-medium text-text-secondary">{set.title}</div>
            <div class="font-mono">{set.ref}</div>
            <div>
              created_at: {set.createdAtSec} / emoji: {set.emojiCount} / via: {set.resolvedVia}
            </div>
          </div>
        {/each}
      </div>
    </details>
  {/if}
  {#if emojiCaveat}
    <p class="text-xs text-yellow-400">{t('dev.emoji.cache_only_caveat')}</p>
  {/if}
  {#if emojiDiagnostics.missingRefs.length > 0}
    <div class="text-xs text-text-muted">
      <div>{t('dev.emoji.missing_refs')} ({emojiDiagnostics.missingRefs.length})</div>
      {#each visibleMissingRefs.visible as ref (ref)}
        <div class="font-mono">{ref}</div>
      {/each}
      {#if visibleMissingRefs.hiddenCount > 0}
        <div>+{visibleMissingRefs.hiddenCount}</div>
      {/if}
    </div>
  {/if}
  {#if emojiDiagnostics.invalidRefs.length > 0}
    <div class="text-xs text-text-muted">
      <div>{t('dev.emoji.invalid_refs')} ({emojiDiagnostics.invalidRefs.length})</div>
      {#each visibleInvalidRefs.visible as ref (ref)}
        <div class="font-mono">{ref}</div>
      {/each}
    </div>
  {/if}
</div>
```

- [ ] **Step 6: Run tests/check**

```bash
pnpm exec vitest run src/web/routes/settings/developer-emoji-diagnostics-view-model.test.ts
pnpm run check
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/web/routes/settings/developer-emoji-diagnostics-view-model.ts src/web/routes/settings/developer-emoji-diagnostics-view-model.test.ts src/web/routes/settings/DeveloperTools.svelte src/shared/i18n/*.json
git commit -m "feat: show emoji diagnostics in developer tools"
```

## Task 7: Integration Verification

**Files:**

- No new source files unless verification exposes a concrete issue.

- [ ] **Step 1: Run focused unit and contract tests**

```bash
pnpm exec vitest run packages/resonote/src/custom-emoji.contract.test.ts packages/resonote/src/local-store-api.contract.test.ts src/shared/browser/emoji-sets.test.ts src/shared/browser/custom-emoji-diagnostics.test.ts src/web/routes/settings/custom-emoji-settings-view-model.test.ts src/web/routes/settings/developer-emoji-diagnostics-view-model.test.ts src/shared/browser/dev-tools.svelte.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run project check**

```bash
pnpm run check
```

Expected: PASS.

- [ ] **Step 3: Run package tests**

```bash
pnpm run test:packages
```

Expected: PASS.

- [ ] **Step 4: Run Auftakt migration proof**

```bash
pnpm run check:auftakt-migration -- --proof
```

Expected: PASS.

- [ ] **Step 5: Review final diff**

```bash
git status --short
git diff --stat main...HEAD
```

Expected: working tree clean, branch contains only custom emoji diagnostics implementation and spec/plan docs.

- [ ] **Step 6: Final commit if verification fixes were needed**

If Step 1-4 required fixes, stage the implementation files covered by this plan and commit only the files that actually changed:

```bash
git add packages/resonote/src/plugins/built-in-plugins.ts packages/resonote/src/runtime.ts packages/resonote/src/custom-emoji.contract.test.ts packages/resonote/src/local-store-api.contract.test.ts src/shared/auftakt/resonote.ts src/shared/browser/emoji-sets.svelte.ts src/shared/browser/emoji-sets.ts src/shared/browser/emoji-sets.test.ts src/shared/browser/custom-emoji-diagnostics.svelte.ts src/shared/browser/custom-emoji-diagnostics.ts src/shared/browser/custom-emoji-diagnostics.test.ts src/web/routes/settings/custom-emoji-settings-view-model.ts src/web/routes/settings/custom-emoji-settings-view-model.test.ts src/web/routes/settings/CustomEmojiSettings.svelte src/web/routes/settings/+page.svelte src/web/routes/settings/developer-emoji-diagnostics-view-model.ts src/web/routes/settings/developer-emoji-diagnostics-view-model.test.ts src/web/routes/settings/DeveloperTools.svelte src/shared/i18n/en.json src/shared/i18n/ja.json src/shared/i18n/de.json src/shared/i18n/es.json src/shared/i18n/fr.json src/shared/i18n/ko.json src/shared/i18n/pt_br.json src/shared/i18n/zh_cn.json src/shared/i18n/ja_kyoto.json src/shared/i18n/ja_osaka.json src/shared/i18n/ja_villainess.json
git commit -m "fix: stabilize custom emoji diagnostics"
```

If no fixes were needed, do not create an empty commit.

---

## Self-Review Checklist

- Spec coverage:
  - Settings summary, refresh, and clear cache are covered by Task 5.
  - DeveloperTools DB counts, source resolution, refs, `created_at`, copy payload, and cache-only caveat are covered by Task 6.
  - Runtime single source resolution and categories diagnostics alignment are covered by Task 1.
  - Refresh stale behavior, pubkey reset, operation races, and clear failure behavior are covered by Task 4.
  - Kind-limited deletion and storage generation are covered by Task 2.
- Placeholder scan:
  - No `TBD`, no open-ended TODO, no "write tests for this" without test code.
- Type consistency:
  - `createdAtSec`, `lastCheckedAtMs`, `lastSuccessfulAtMs`, `dbCounts`, `missingRefs`, `invalidRefs`, `sourceMode`, and `resolvedVia` match the design spec.
- Risk note:
  - Task 1's sample implementation treats relay fetch rejection as top-level error. If existing runtime can distinguish partial relay failure with local cache fallback, implement that in the same helper and add a warning test before Task 1 commit.
