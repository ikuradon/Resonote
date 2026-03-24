import { describe, expect, it } from 'vitest';

import { allocateEmojiPopoverId } from './emoji-popover-id.js';

describe('allocateEmojiPopoverId', () => {
  it('should generate stable prefixed ids', () => {
    const id = allocateEmojiPopoverId();
    expect(id.startsWith('emoji-popover-')).toBe(true);
  });

  it('should generate unique ids across calls', () => {
    const first = allocateEmojiPopoverId();
    const second = allocateEmojiPopoverId();
    expect(second).not.toBe(first);
  });
});
