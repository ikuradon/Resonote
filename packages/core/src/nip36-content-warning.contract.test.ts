import { describe, expect, it } from 'vitest';

import {
  buildNip36ContentWarningTag,
  hasNip36ContentWarning,
  NIP36_CONTENT_WARNING_TAG,
  parseNip36ContentWarning
} from './index.js';

describe('NIP-36 content warning tags', () => {
  it('builds bare and reasoned content-warning tags', () => {
    expect(buildNip36ContentWarningTag()).toEqual([NIP36_CONTENT_WARNING_TAG]);
    expect(buildNip36ContentWarningTag(' spoiler ')).toEqual([
      NIP36_CONTENT_WARNING_TAG,
      'spoiler'
    ]);
  });

  it('parses the first content-warning tag', () => {
    expect(
      parseNip36ContentWarning({
        tags: [
          ['t', 'music'],
          ['content-warning', 'spoiler']
        ]
      })
    ).toEqual({ reason: 'spoiler' });
  });

  it('treats omitted or blank reasons as present warnings without reason', () => {
    expect(parseNip36ContentWarning({ tags: [['content-warning']] })).toEqual({ reason: null });
    expect(parseNip36ContentWarning({ tags: [['content-warning', '  ']] })).toEqual({
      reason: null
    });
  });

  it('detects absence of content-warning tags', () => {
    expect(hasNip36ContentWarning({ tags: [['t', 'music']] })).toBe(false);
    expect(hasNip36ContentWarning({ tags: [['content-warning', 'sensitive']] })).toBe(true);
  });
});
