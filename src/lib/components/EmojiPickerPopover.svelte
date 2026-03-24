<script lang="ts" module>
  /** Globally tracks the active popover so only one picker is open at a time. */
  let activePopoverId = $state<string | null>(null);
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import type { Action } from 'svelte/action';

  import { isNodeInsideElements, manageClickOutside } from '$shared/browser/click-outside.js';
  import { preloadEmojiMart } from '$shared/browser/emoji-mart.js';
  import { t } from '$shared/i18n/t.js';

  import EmojiPicker from './EmojiPicker.svelte';

  interface Props {
    id: string;
    onSelect: (reaction: string, emojiUrl?: string) => void;
  }

  let { id, onSelect }: Props = $props();

  let triggerEl = $state<HTMLButtonElement | null>(null);
  let popoverEl = $state<HTMLDivElement | null>(null);
  let popoverStyle = $state('');

  let isOpen = $derived(activePopoverId === id);

  function toggle() {
    if (isOpen) {
      activePopoverId = null;
    } else {
      activePopoverId = id;
      updatePosition();
    }
  }

  function handleSelect(reaction: string, emojiUrl?: string) {
    activePopoverId = null;
    onSelect(reaction, emojiUrl);
  }

  function updatePosition() {
    if (!triggerEl) return;
    const rect = triggerEl.getBoundingClientRect();
    const pickerWidth = 352;
    const pickerHeight = 435;

    let left = rect.left;
    let top = rect.bottom + 4;

    if (left + pickerWidth > window.innerWidth) {
      left = window.innerWidth - pickerWidth - 8;
    }
    if (left < 8) left = 8;

    if (top + pickerHeight > window.innerHeight) {
      top = rect.top - pickerHeight - 4;
    }

    popoverStyle = `left:${left}px;top:${top}px`;
  }

  /** Move the element to document.body to escape ancestor transforms/filters. */
  const portal: Action = (node) => {
    document.body.appendChild(node);
    return {
      destroy() {
        node.remove();
      }
    };
  };

  onMount(() => {
    return () => {
      if (activePopoverId === id) activePopoverId = null;
    };
  });

  manageClickOutside({
    active: () => isOpen,
    isInside: (target) => isNodeInsideElements(target, [triggerEl, popoverEl]),
    onOutside: () => {
      activePopoverId = null;
    }
  });
</script>

<button
  bind:this={triggerEl}
  type="button"
  onclick={toggle}
  onpointerenter={preloadEmojiMart}
  onfocus={preloadEmojiMart}
  class="rounded-lg p-1.5 text-text-muted transition-colors hover:text-text-secondary"
  title={t('emoji.title')}
>
  {#if isOpen}
    <svg
      aria-hidden="true"
      class="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  {:else}
    <svg
      aria-hidden="true"
      class="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
      <line x1="9" y1="9" x2="9.01" y2="9" />
      <line x1="15" y1="9" x2="15.01" y2="9" />
    </svg>
  {/if}
</button>

{#if isOpen}
  <div bind:this={popoverEl} class="fixed z-50" style={popoverStyle} use:portal>
    <EmojiPicker onSelect={handleSelect} />
  </div>
{/if}
