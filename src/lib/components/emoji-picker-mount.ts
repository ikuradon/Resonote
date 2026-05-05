import type { Action } from 'svelte/action';

import type { EmojiCategory } from '$shared/browser/emoji-sets.js';

interface EmojiMartModules {
  data: unknown;
  Picker: new (opts: Record<string, unknown>) => { remove(): void };
}

interface EmojiPickerMountOptions {
  getEmojiMartModules: () => Promise<EmojiMartModules>;
  getLocale: () => string;
  onEmojiSelect: (emoji: Record<string, unknown>) => void;
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

    void options.getEmojiMartModules().then((loaded) => {
      modules = loaded;
      appendPicker();
    });

    return {
      update(nextCustom = []) {
        if (nextCustom === custom) return;
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
