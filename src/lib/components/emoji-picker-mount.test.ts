import { describe, expect, it, vi } from 'vitest';

import type { EmojiCategory } from '$shared/browser/emoji-sets.js';

import { createEmojiPickerMountAction } from './emoji-picker-mount.js';

function category(id: string): EmojiCategory {
  return {
    id,
    name: id,
    emojis: [{ id: 'wave', name: 'wave', skins: [{ src: 'https://example.com/wave.png' }] }]
  };
}

describe('createEmojiPickerMountAction', () => {
  it('空カテゴリで mount した後のカテゴリ更新を Picker に反映する', async () => {
    const appended: unknown[] = [];
    const removed: unknown[] = [];
    const node = {
      appendChild: vi.fn((child: unknown) => appended.push(child))
    } as unknown as HTMLDivElement;

    class Picker {
      options: Record<string, unknown>;

      constructor(options: Record<string, unknown>) {
        this.options = options;
      }

      remove() {
        removed.push(this);
      }
    }

    const action = createEmojiPickerMountAction({
      getEmojiMartModules: async () => ({ data: { emojis: {} }, Picker }),
      getLocale: () => 'ja',
      onEmojiSelect: vi.fn()
    });

    const handle = action(node, []);
    await Promise.resolve();

    const custom = [category('custom-inline')];
    handle?.update?.(custom);
    await Promise.resolve();

    expect(appended).toHaveLength(2);
    expect(removed).toEqual([appended[0]]);
    expect((appended[1] as Picker).options.custom).toBe(custom);
  });
});
