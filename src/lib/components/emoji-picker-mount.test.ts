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

  it('モジュール読み込み前の update で渡したカテゴリを初回生成に反映する', async () => {
    const appended: unknown[] = [];
    const node = {
      appendChild: vi.fn((child: unknown) => appended.push(child))
    } as unknown as HTMLDivElement;

    class Picker {
      options: Record<string, unknown>;

      constructor(options: Record<string, unknown>) {
        this.options = options;
      }

      remove() {}
    }

    let resolveModules: ((value: { data: unknown; Picker: typeof Picker }) => void) | null = null;
    const modulesPromise = new Promise<{ data: unknown; Picker: typeof Picker }>((resolve) => {
      resolveModules = resolve;
    });

    const action = createEmojiPickerMountAction({
      getEmojiMartModules: () => modulesPromise,
      getLocale: () => 'ja',
      onEmojiSelect: vi.fn()
    });

    const handle = action(node, []);
    const custom = [category('custom-inline')];
    handle?.update?.(custom);

    resolveModules?.({ data: { emojis: {} }, Picker });
    await Promise.resolve();

    expect(appended).toHaveLength(1);
    expect((appended[0] as Picker).options.custom).toBe(custom);
  });

  it('同じ内容のカテゴリ配列では Picker を再生成しない', async () => {
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

    const initial = [category('custom-inline')];
    const handle = action(node, initial);
    await Promise.resolve();

    const equalButDifferentReference = [
      {
        ...initial[0],
        emojis: initial[0].emojis.map((emoji) => ({
          ...emoji,
          skins: emoji.skins.map((skin) => ({ ...skin }))
        }))
      }
    ];
    handle?.update?.(equalButDifferentReference);
    await Promise.resolve();

    expect(appended).toHaveLength(1);
    expect(removed).toHaveLength(0);
  });

  it('モジュール読み込み失敗時に例外を握り潰さずログ出力する', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const node = {
      appendChild: vi.fn()
    } as unknown as HTMLDivElement;

    const action = createEmojiPickerMountAction({
      getEmojiMartModules: async () => {
        throw new Error('module load failed');
      },
      getLocale: () => 'ja',
      onEmojiSelect: vi.fn()
    });

    action(node, []);
    await Promise.resolve();
    await Promise.resolve();

    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
