import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  fetchDiagnosticsMock,
  countStoredEventsByKindsMock,
  deleteStoredEventsByKindsMock,
  setCustomEmojisMock,
  clearCustomEmojisMock
} = vi.hoisted(() => ({
  fetchDiagnosticsMock: vi.fn(),
  countStoredEventsByKindsMock: vi.fn(),
  deleteStoredEventsByKindsMock: vi.fn(),
  setCustomEmojisMock: vi.fn(),
  clearCustomEmojisMock: vi.fn()
}));

vi.mock('$shared/auftakt/resonote.js', () => ({
  fetchCustomEmojiSourceDiagnostics: fetchDiagnosticsMock,
  countStoredEventsByKinds: countStoredEventsByKindsMock,
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

function result(overrides = {}, categories = defaultCategories()) {
  return {
    diagnostics: {
      listEvent: {
        id: 'list',
        createdAtSec: 100,
        inlineEmojiCount: 1,
        referencedSetRefCount: 1
      },
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
    categories
  };
}

function defaultCategories() {
  return [
    {
      id: 'custom-inline',
      name: 'Custom',
      emojis: [
        {
          id: 'wave',
          name: 'wave',
          skins: [{ src: 'https://example.com/wave.png' }]
        }
      ]
    }
  ];
}

describe('custom emoji diagnostics browser state', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.setSystemTime(new Date('2026-05-05T00:00:00.000Z'));
    fetchDiagnosticsMock.mockReset();
    countStoredEventsByKindsMock.mockReset();
    deleteStoredEventsByKindsMock.mockReset();
    setCustomEmojisMock.mockReset();
    clearCustomEmojisMock.mockReset();
    countStoredEventsByKindsMock.mockResolvedValue([
      { kind: 10030, count: 0 },
      { kind: 30030, count: 0 }
    ]);
    resetCustomEmojiDiagnosticsForPubkey(null);
    clearCustomEmojisMock.mockClear();
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

  it('refresh success records post-refresh stored custom emoji event counts', async () => {
    resetCustomEmojiDiagnosticsForPubkey(PUBKEY);
    fetchDiagnosticsMock.mockResolvedValue(result());
    countStoredEventsByKindsMock.mockResolvedValue([
      { kind: 10030, count: 2 },
      { kind: 30030, count: 5 }
    ]);

    await refreshCustomEmojiDiagnostics(PUBKEY);

    expect(countStoredEventsByKindsMock).toHaveBeenCalledWith([10030, 30030]);
    expect(getCustomEmojiDiagnostics().dbCounts).toEqual({ kind10030: 2, kind30030: 5 });
  });

  it.each([
    [[{ kind: 10030, count: 3 }], { kind10030: 3, kind30030: 0 }],
    [[{ kind: 30030, count: 7 }], { kind10030: 0, kind30030: 7 }],
    [[], { kind10030: 0, kind30030: 0 }]
  ])(
    'refresh success defaults missing stored event counts independently',
    async (counts, expected) => {
      resetCustomEmojiDiagnosticsForPubkey(PUBKEY);
      fetchDiagnosticsMock.mockResolvedValue(result());
      countStoredEventsByKindsMock.mockResolvedValue(counts);

      await refreshCustomEmojiDiagnostics(PUBKEY);

      expect(getCustomEmojiDiagnostics().dbCounts).toEqual(expected);
    }
  );

  it.each([
    [
      'no-list-event',
      {
        listEvent: null,
        sets: [],
        missingRefs: [],
        invalidRefs: [],
        sourceMode: 'unknown'
      }
    ],
    [
      'only-invalid-set-refs',
      {
        listEvent: {
          id: 'list',
          createdAtSec: 100,
          inlineEmojiCount: 0,
          referencedSetRefCount: 0
        },
        sets: [],
        missingRefs: [],
        invalidRefs: ['not-a-ref']
      }
    ],
    [
      'no-emoji-sources',
      {
        listEvent: {
          id: 'list',
          createdAtSec: 100,
          inlineEmojiCount: 0,
          referencedSetRefCount: 0
        },
        sets: [],
        missingRefs: [],
        invalidRefs: []
      }
    ],
    [
      'all-set-refs-missing',
      {
        listEvent: {
          id: 'list',
          createdAtSec: 100,
          inlineEmojiCount: 0,
          referencedSetRefCount: 1
        },
        sets: [],
        missingRefs: [`30030:${PUBKEY}:missing`],
        invalidRefs: []
      }
    ],
    [
      'resolved-sets-empty',
      {
        listEvent: {
          id: 'list',
          createdAtSec: 100,
          inlineEmojiCount: 0,
          referencedSetRefCount: 1
        },
        sets: [
          {
            ref: `30030:${PUBKEY}:empty`,
            id: 'empty-set',
            pubkey: PUBKEY,
            dTag: 'empty',
            title: 'Empty',
            createdAtSec: 120,
            emojiCount: 0,
            resolvedVia: 'cache'
          }
        ],
        missingRefs: [],
        invalidRefs: []
      }
    ],
    [
      'no-valid-emoji',
      {
        listEvent: {
          id: 'list',
          createdAtSec: 100,
          inlineEmojiCount: 1,
          referencedSetRefCount: 0
        },
        sets: [],
        missingRefs: [],
        invalidRefs: []
      }
    ]
  ])('sets emptyReason %s for empty diagnostics results', async (expectedReason, overrides) => {
    resetCustomEmojiDiagnosticsForPubkey(PUBKEY);
    fetchDiagnosticsMock.mockResolvedValue(result(overrides, []));

    await refreshCustomEmojiDiagnostics(PUBKEY);

    const state = getCustomEmojiDiagnostics();
    expect(state.status).toBe('empty');
    expect(state.emptyReason).toBe(expectedReason);
    expect(state.summary).toEqual({ categoryCount: 0, emojiCount: 0 });
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

  it('ignores a refresh success when the pubkey is reset before completion', async () => {
    resetCustomEmojiDiagnosticsForPubkey(PUBKEY);
    let resolveRefresh: (value: ReturnType<typeof result>) => void = () => {};
    fetchDiagnosticsMock.mockImplementation(
      () => new Promise((resolve) => (resolveRefresh = resolve))
    );

    const refresh = refreshCustomEmojiDiagnostics(PUBKEY);
    resetCustomEmojiDiagnosticsForPubkey('q'.repeat(64));
    clearCustomEmojisMock.mockClear();
    resolveRefresh(result());
    await refresh;

    const state = getCustomEmojiDiagnostics();
    expect(state.pubkey).toBe('q'.repeat(64));
    expect(state.status).toBe('idle');
    expect(setCustomEmojisMock).not.toHaveBeenCalled();
    expect(clearCustomEmojisMock).not.toHaveBeenCalled();
  });

  it('ignores a refresh failure when a newer operation has already started', async () => {
    resetCustomEmojiDiagnosticsForPubkey(PUBKEY);
    let rejectRefresh: (error: Error) => void = () => {};
    fetchDiagnosticsMock.mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejectRefresh = reject;
        })
    );

    const refresh = refreshCustomEmojiDiagnostics(PUBKEY);
    resetCustomEmojiDiagnosticsForPubkey('q'.repeat(64));
    rejectRefresh(new Error('stale failure'));
    await refresh;

    const state = getCustomEmojiDiagnostics();
    expect(state.pubkey).toBe('q'.repeat(64));
    expect(state.status).toBe('idle');
    expect(state.error).toBeNull();
  });

  it('initial refresh failure records string errors without stale diagnostics', async () => {
    resetCustomEmojiDiagnosticsForPubkey(PUBKEY);
    fetchDiagnosticsMock.mockRejectedValueOnce('offline');

    await refreshCustomEmojiDiagnostics(PUBKEY);

    const state = getCustomEmojiDiagnostics();
    expect(state.status).toBe('error');
    expect(state.error).toBe('offline');
    expect(state.stale).toBe(false);
    expect(state.summary).toEqual({ categoryCount: 0, emojiCount: 0 });
    expect(setCustomEmojisMock).not.toHaveBeenCalled();
  });

  it('clear success resets state and clears categories', async () => {
    resetCustomEmojiDiagnosticsForPubkey(PUBKEY);
    fetchDiagnosticsMock.mockResolvedValue(result());
    await refreshCustomEmojiDiagnostics(PUBKEY);
    deleteStoredEventsByKindsMock.mockResolvedValue(undefined);
    clearCustomEmojisMock.mockClear();

    await clearCustomEmojiCache();

    const state = getCustomEmojiDiagnostics();
    expect(deleteStoredEventsByKindsMock).toHaveBeenCalledWith([10030, 30030]);
    expect(clearCustomEmojisMock).toHaveBeenCalledOnce();
    expect(state.pubkey).toBe(PUBKEY);
    expect(state.status).toBe('idle');
    expect(state.dbCounts).toEqual({ kind10030: 0, kind30030: 0 });
    expect(state.lastCheckedAtMs).toBeNull();
  });

  it('ignores a clear success when the pubkey is reset before completion', async () => {
    resetCustomEmojiDiagnosticsForPubkey(PUBKEY);
    fetchDiagnosticsMock.mockResolvedValue(result());
    await refreshCustomEmojiDiagnostics(PUBKEY);
    let resolveClear: () => void = () => {};
    deleteStoredEventsByKindsMock.mockImplementation(
      () => new Promise<void>((resolve) => (resolveClear = resolve))
    );

    const clear = clearCustomEmojiCache();
    resetCustomEmojiDiagnosticsForPubkey('q'.repeat(64));
    clearCustomEmojisMock.mockClear();
    resolveClear();
    await clear;

    const state = getCustomEmojiDiagnostics();
    expect(state.pubkey).toBe('q'.repeat(64));
    expect(state.status).toBe('idle');
    expect(clearCustomEmojisMock).not.toHaveBeenCalled();
  });

  it('ignores a clear failure when the pubkey is reset before completion', async () => {
    resetCustomEmojiDiagnosticsForPubkey(PUBKEY);
    fetchDiagnosticsMock.mockResolvedValue(result());
    await refreshCustomEmojiDiagnostics(PUBKEY);
    let rejectClear: (error: Error) => void = () => {};
    deleteStoredEventsByKindsMock.mockImplementation(
      () => new Promise<void>((_, reject) => (rejectClear = reject))
    );

    const clear = clearCustomEmojiCache();
    resetCustomEmojiDiagnosticsForPubkey('q'.repeat(64));
    rejectClear(new Error('stale clear failure'));

    await expect(clear).rejects.toThrow('stale clear failure');
    const state = getCustomEmojiDiagnostics();
    expect(state.pubkey).toBe('q'.repeat(64));
    expect(state.status).toBe('idle');
    expect(state.error).toBeNull();
    expect(state.isClearing).toBe(false);
  });

  it('clear failure preserves diagnostics and reports the error', async () => {
    resetCustomEmojiDiagnosticsForPubkey(PUBKEY);
    fetchDiagnosticsMock.mockResolvedValue(result());
    await refreshCustomEmojiDiagnostics(PUBKEY);
    deleteStoredEventsByKindsMock.mockRejectedValue(new Error('delete failed'));
    clearCustomEmojisMock.mockClear();

    await expect(clearCustomEmojiCache()).rejects.toThrow('delete failed');

    const state = getCustomEmojiDiagnostics();
    expect(state.status).toBe('ready');
    expect(state.summary).toEqual({ categoryCount: 1, emojiCount: 1 });
    expect(state.error).toBe('delete failed');
    expect(state.isClearing).toBe(false);
    expect(clearCustomEmojisMock).not.toHaveBeenCalled();
  });

  it('returns snapshots that cannot mutate the next diagnostics read', async () => {
    resetCustomEmojiDiagnosticsForPubkey(PUBKEY);
    fetchDiagnosticsMock.mockResolvedValue(
      result({
        missingRefs: [`30030:${PUBKEY}:missing`],
        warnings: ['first warning']
      })
    );
    await refreshCustomEmojiDiagnostics(PUBKEY);

    const snapshot = getCustomEmojiDiagnostics() as unknown as {
      summary: { emojiCount: number };
      listEvent: { id: string } | null;
      sets: Array<{ title: string }>;
      missingRefs: string[];
      warnings: string[];
    };
    snapshot.summary.emojiCount = 99;
    if (snapshot.listEvent) snapshot.listEvent.id = 'mutated-list';
    snapshot.sets[0].title = 'Mutated';
    snapshot.missingRefs.push('mutated-ref');
    snapshot.warnings.push('mutated-warning');

    const next = getCustomEmojiDiagnostics();
    expect(next.summary).toEqual({ categoryCount: 1, emojiCount: 1 });
    expect(next.listEvent?.id).toBe('list');
    expect(next.sets[0].title).toBe('Set');
    expect(next.missingRefs).toEqual([`30030:${PUBKEY}:missing`]);
    expect(next.warnings).toEqual(['first warning']);
  });

  it('does not allow refresh while clear is active', async () => {
    resetCustomEmojiDiagnosticsForPubkey(PUBKEY);
    deleteStoredEventsByKindsMock.mockImplementation(() => new Promise(() => {}));

    void clearCustomEmojiCache();

    await expect(refreshCustomEmojiDiagnostics(PUBKEY)).rejects.toThrow(
      'Cannot refresh while clearing custom emoji cache'
    );
  });

  it('rejects duplicate clear while the first clear remains active', async () => {
    resetCustomEmojiDiagnosticsForPubkey(PUBKEY);
    fetchDiagnosticsMock.mockResolvedValue(result());
    await refreshCustomEmojiDiagnostics(PUBKEY);
    clearCustomEmojisMock.mockClear();
    let resolveClear: () => void = () => {};
    deleteStoredEventsByKindsMock.mockImplementation(
      () => new Promise<void>((resolve) => (resolveClear = resolve))
    );

    const firstClear = clearCustomEmojiCache();

    const duplicateResult = await Promise.race([
      clearCustomEmojiCache().catch((error: unknown) => error),
      new Promise((resolve) => setTimeout(() => resolve('duplicate clear remained pending'), 0))
    ]);

    expect(duplicateResult).toBeInstanceOf(Error);
    expect((duplicateResult as Error).message).toBe(
      'Cannot clear custom emoji cache while clearing is already in progress'
    );

    resolveClear();
    await firstClear;

    const state = getCustomEmojiDiagnostics();
    expect(deleteStoredEventsByKindsMock).toHaveBeenCalledOnce();
    expect(clearCustomEmojisMock).toHaveBeenCalledOnce();
    expect(state.status).toBe('idle');
    expect(state.summary).toEqual({ categoryCount: 0, emojiCount: 0 });
    expect(state.isClearing).toBe(false);
  });
});
