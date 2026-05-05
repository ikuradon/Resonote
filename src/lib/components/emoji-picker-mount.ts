import type { Action } from 'svelte/action';

import type { EmojiCategory } from '$shared/browser/emoji-sets.js';
import { createLogger } from '$shared/utils/logger.js';

const log = createLogger('emoji-picker-mount');

interface EmojiMartModules {
  data: unknown;
  Picker: new (opts: Record<string, unknown>) => { remove(): void };
}

interface EmojiPickerMountOptions {
  getEmojiMartModules: () => Promise<EmojiMartModules>;
  getLocale: () => string;
  onEmojiSelect: (emoji: Record<string, unknown>) => void;
}

function hasSameCustomCategories(
  a: readonly EmojiCategory[],
  b: readonly EmojiCategory[]
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i];
    const right = b[i];
    if (left.id !== right.id || left.name !== right.name) return false;
    if (left.emojis.length !== right.emojis.length) return false;
    for (let j = 0; j < left.emojis.length; j += 1) {
      const leftEmoji = left.emojis[j];
      const rightEmoji = right.emojis[j];
      if (leftEmoji.id !== rightEmoji.id || leftEmoji.name !== rightEmoji.name) return false;
      if (leftEmoji.skins.length !== rightEmoji.skins.length) return false;
      for (let k = 0; k < leftEmoji.skins.length; k += 1) {
        if (leftEmoji.skins[k]?.src !== rightEmoji.skins[k]?.src) return false;
      }
    }
  }
  return true;
}

export function createEmojiPickerMountAction(
  options: EmojiPickerMountOptions
): Action<HTMLDivElement, EmojiCategory[]> {
  return (node, initialCustom = []) => {
    let mounted = true;
    let custom = initialCustom;
    let picker: { remove(): void } | null = null;
    let modules: EmojiMartModules | null = null;

    function removePicker() {
      picker?.remove();
      picker = null;
    }

    function appendPicker() {
      if (!mounted || !modules) return;
      removePicker();

      const PickerClass = modules.Picker;
      picker = new PickerClass({
        data: modules.data,
        custom: custom.length > 0 ? custom : undefined,
        theme: 'dark',
        locale: options.getLocale(),
        previewPosition: 'none',
        skinTonePosition: 'search',
        onEmojiSelect: options.onEmojiSelect
      });
      node.appendChild(picker as unknown as Node);
    }

    void options
      .getEmojiMartModules()
      .then((loaded) => {
        modules = loaded;
        appendPicker();
      })
      .catch((error: unknown) => {
        log.error('Failed to load emoji mart modules', error);
      });

    return {
      update(nextCustom = []) {
        if (hasSameCustomCategories(nextCustom, custom)) return;
        custom = nextCustom;
        appendPicker();
      },
      destroy() {
        mounted = false;
        removePicker();
      }
    };
  };
}
