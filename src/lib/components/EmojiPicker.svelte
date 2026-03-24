<script lang="ts">
  import type { Action } from 'svelte/action';

  import { getEmojiMartModules } from '$shared/browser/emoji-mart.js';
  import { type EmojiCategory, getCustomEmojis } from '$shared/browser/emoji-sets.js';
  import { getLocale } from '$shared/browser/locale.js';
  import { extractShortcode } from '$shared/utils/emoji.js';

  interface Props {
    onSelect: (reaction: string, emojiUrl?: string) => void;
  }

  let { onSelect }: Props = $props();

  const emojiSets = getCustomEmojis();

  function handleEmojiSelect(emoji: Record<string, unknown>) {
    if (typeof emoji.native === 'string') {
      onSelect(emoji.native);
    } else if (typeof emoji.src === 'string') {
      const raw =
        typeof emoji.shortcodes === 'string'
          ? emoji.shortcodes
          : typeof emoji.id === 'string'
            ? emoji.id
            : 'emoji';
      const shortcode = extractShortcode(raw);
      onSelect(`:${shortcode}:`, emoji.src);
    }
  }

  const mountPicker: Action<HTMLDivElement, EmojiCategory[]> = (node, custom) => {
    let mounted = true;

    (async () => {
      const { data, Picker } = await getEmojiMartModules();

      if (!mounted) return;

      const PickerClass = Picker as new (opts: Record<string, unknown>) => HTMLElement;
      const picker = new PickerClass({
        data,
        custom: custom.length > 0 ? custom : undefined,
        theme: 'dark',
        locale: getLocale(),
        previewPosition: 'none',
        skinTonePosition: 'search',
        onEmojiSelect: handleEmojiSelect
      });

      node.appendChild(picker);
    })();

    return {
      destroy() {
        mounted = false;
      }
    };
  };
</script>

<div use:mountPicker={emojiSets.categories} class="emoji-picker-container"></div>
