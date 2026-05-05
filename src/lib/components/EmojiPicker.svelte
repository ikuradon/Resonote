<script lang="ts">
  import type { Action } from 'svelte/action';

  import { extractShortcode } from '$shared/auftakt/resonote.js';
  import { getEmojiMartModules } from '$shared/browser/emoji-mart.js';
  import { getCustomEmojis } from '$shared/browser/emoji-sets.js';
  import { getLocale } from '$shared/browser/locale.js';

  import { createEmojiPickerMountAction } from './emoji-picker-mount.js';

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

  const mountPicker: Action<HTMLDivElement, typeof emojiSets.categories> =
    createEmojiPickerMountAction({
      getEmojiMartModules: async () => {
        const { data, Picker } = await getEmojiMartModules();
        return { data, Picker: Picker as new (opts: Record<string, unknown>) => HTMLElement };
      },
      getLocale,
      onEmojiSelect: handleEmojiSelect
    });
</script>

<div use:mountPicker={emojiSets.categories} class="emoji-picker-container"></div>
