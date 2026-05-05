import {
  countStoredEventsByKinds,
  type CustomEmojiDiagnosticsSource,
  deleteStoredEventsByKinds,
  type EmojiCategory,
  fetchCustomEmojiSourceDiagnostics
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

function cloneCategories(categories: readonly EmojiCategory[]): EmojiCategory[] {
  return categories.map((category) => ({
    ...category,
    emojis: category.emojis.map((emoji) => ({
      ...emoji,
      skins: emoji.skins.map((skin) => ({ ...skin }))
    }))
  }));
}

function cloneSource(source: CustomEmojiDiagnosticsSource) {
  return {
    listEvent: source.listEvent ? { ...source.listEvent } : null,
    sets: source.sets.map((set) => ({ ...set })),
    missingRefs: [...source.missingRefs],
    invalidRefs: [...source.invalidRefs],
    warnings: [...source.warnings],
    sourceMode: source.sourceMode
  };
}

function summarize(categories: readonly EmojiCategory[]) {
  return {
    categoryCount: categories.length,
    emojiCount: categories.reduce((sum, category) => sum + category.emojis.length, 0)
  };
}

async function readCustomEmojiDbCounts(): Promise<{ kind10030: number; kind30030: number }> {
  const counts = await countStoredEventsByKinds([10030, 30030]);
  return {
    kind10030: counts.find((entry) => entry.kind === 10030)?.count ?? 0,
    kind30030: counts.find((entry) => entry.kind === 30030)?.count ?? 0
  };
}

function emptyReasonFor(
  source: CustomEmojiDiagnosticsSource,
  categories: readonly EmojiCategory[]
): CustomEmojiEmptyReason | null {
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
  if (validInlineEmojiCount === 0 && validSetRefCount === 0) {
    return 'no-emoji-sources';
  }
  if (
    validSetRefCount > 0 &&
    resolvedSetCount === 0 &&
    source.missingRefs.length === validSetRefCount
  ) {
    return 'all-set-refs-missing';
  }
  if (resolvedSetCount > 0 && resolvedSetEmojiCount === 0) {
    return 'resolved-sets-empty';
  }
  return 'no-valid-emoji';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function startOperation(kind: 'refresh' | 'clear'): number {
  if (kind === 'refresh' && state.isClearing) {
    throw new Error('Cannot refresh while clearing custom emoji cache');
  }
  if (kind === 'clear' && state.isClearing) {
    throw new Error('Cannot clear custom emoji cache while clearing is already in progress');
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
  if (state.lastSuccessfulAtMs === null) {
    state.status = 'loading';
  }
  state.pubkey = pubkey;
  try {
    const result = await fetchCustomEmojiSourceDiagnostics(pubkey);
    const dbCounts = await readCustomEmojiDbCounts();
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
      dbCounts,
      summary,
      ...cloneSource(result.diagnostics),
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
      error: errorMessage(error),
      stale: state.lastSuccessfulAtMs !== null
    };
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
        error: errorMessage(error)
      };
    }
    throw error;
  } finally {
    if (version === operationVersion) {
      state.isClearing = false;
    }
  }
}

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
