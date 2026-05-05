import { describe, expect, it, vi } from 'vitest';

import {
  buildEmojiDiagnosticsCopyPayload,
  cacheOnlyCaveat,
  diagnosticRefRowKey,
  replaceCopiedFeedbackTimer,
  truncateRefs
} from './developer-emoji-diagnostics-view-model.js';

describe('truncateRefs', () => {
  it('shows refs up to the default limit and reports the hidden count', () => {
    const refs = Array.from({ length: 22 }, (_, index) => `ref-${index + 1}`);

    expect(truncateRefs(refs)).toEqual({
      visible: refs.slice(0, 20),
      hiddenCount: 2
    });
  });

  it('supports a custom visible limit without mutating input refs', () => {
    const refs = ['a', 'b', 'c'];

    expect(truncateRefs(refs, 2)).toEqual({
      visible: ['a', 'b'],
      hiddenCount: 1
    });
    expect(refs).toEqual(['a', 'b', 'c']);
  });
});

describe('cacheOnlyCaveat', () => {
  it('returns localized caveat only for cache-only mode with referenced set refs', () => {
    const translate = (key: 'dev.emoji.cache_only_caveat') => `translated:${key}`;

    expect(cacheOnlyCaveat('cache-only', 1, translate)).toBe(
      'translated:dev.emoji.cache_only_caveat'
    );
    expect(cacheOnlyCaveat('relay-checked', 1, translate)).toBeNull();
    expect(cacheOnlyCaveat('cache-only', 0, translate)).toBeNull();
  });
});

describe('diagnosticRefRowKey', () => {
  it('keeps duplicate invalid refs renderable with unique row keys', () => {
    const refs = ['broken-ref', 'broken-ref', 'other-ref'];

    expect(refs.map((ref, index) => diagnosticRefRowKey(ref, index))).toEqual([
      '0:broken-ref',
      '1:broken-ref',
      '2:other-ref'
    ]);
  });
});

describe('replaceCopiedFeedbackTimer', () => {
  it('clears an existing feedback timer before starting the next one', () => {
    const previousTimer = 10;
    const nextTimer = 20;
    const clearTimer = vi.fn();
    const setTimer = vi.fn((callback: () => void, delayMs: number) => {
      expect(delayMs).toBe(2000);
      callback();
      return nextTimer;
    });
    const hideFeedback = vi.fn();

    expect(
      replaceCopiedFeedbackTimer(previousTimer, hideFeedback, {
        setTimer,
        clearTimer
      })
    ).toBe(nextTimer);
    expect(clearTimer).toHaveBeenCalledWith(previousTimer);
    expect(hideFeedback).toHaveBeenCalledOnce();
  });
});

describe('buildEmojiDiagnosticsCopyPayload', () => {
  it('serializes all diagnostic sets, refs, source mode, and warnings', () => {
    const payload = buildEmojiDiagnosticsCopyPayload({
      dbCounts: { kind10030: 1, kind30030: 2 },
      summary: { categoryCount: 3, emojiCount: 4 },
      listEvent: {
        id: 'list-id',
        createdAtSec: 1710000000,
        inlineEmojiCount: 5,
        referencedSetRefCount: 6
      },
      sets: [
        {
          ref: '30030:pubkey:animals',
          id: 'set-id-1',
          pubkey: 'pubkey',
          dTag: 'animals',
          title: 'Animals',
          createdAtSec: 1710000001,
          emojiCount: 7,
          resolvedVia: 'cache'
        },
        {
          ref: '30030:pubkey:foods',
          id: 'set-id-2',
          pubkey: 'pubkey',
          dTag: 'foods',
          title: 'Foods',
          createdAtSec: 1710000002,
          emojiCount: 8,
          resolvedVia: 'relay'
        }
      ],
      missingRefs: ['missing-1', 'missing-2'],
      invalidRefs: ['invalid-1', 'invalid-2'],
      sourceMode: 'cache-only',
      warnings: ['warn-1', 'warn-2']
    });

    expect(JSON.parse(payload)).toEqual({
      dbCounts: { kind10030: 1, kind30030: 2 },
      summary: { categoryCount: 3, emojiCount: 4 },
      listEvent: {
        id: 'list-id',
        createdAtSec: 1710000000,
        inlineEmojiCount: 5,
        referencedSetRefCount: 6
      },
      sets: [
        {
          ref: '30030:pubkey:animals',
          id: 'set-id-1',
          pubkey: 'pubkey',
          dTag: 'animals',
          title: 'Animals',
          createdAtSec: 1710000001,
          emojiCount: 7,
          resolvedVia: 'cache'
        },
        {
          ref: '30030:pubkey:foods',
          id: 'set-id-2',
          pubkey: 'pubkey',
          dTag: 'foods',
          title: 'Foods',
          createdAtSec: 1710000002,
          emojiCount: 8,
          resolvedVia: 'relay'
        }
      ],
      missingRefs: ['missing-1', 'missing-2'],
      invalidRefs: ['invalid-1', 'invalid-2'],
      sourceMode: 'cache-only',
      warnings: ['warn-1', 'warn-2']
    });
  });
});
