<script lang="ts" module>
  /** Globally tracks the active popover so only one picker is open at a time. */
  let activePopoverId = $state<string | null>(null);

  let nextId = 0;
  export function allocatePopoverId(): string {
    return `emoji-popover-${nextId++}`;
  }

  /** Registry of mounted popovers for the global click-outside handler. */
  const registry = new Map<string, { trigger: HTMLElement; popover: HTMLElement | null }>();
  let listenerAttached = false;

  function handleGlobalClick(e: MouseEvent) {
    if (!activePopoverId) return;
    const entry = registry.get(activePopoverId);
    if (!entry) return;
    const target = e.target as Node;
    if (entry.trigger.contains(target)) return;
    if (entry.popover?.contains(target)) return;
    activePopoverId = null;
  }

  function ensureGlobalListener() {
    if (listenerAttached) return;
    document.addEventListener('click', handleGlobalClick, true);
    listenerAttached = true;
  }
</script>

<script lang="ts">
  import EmojiPicker from './EmojiPicker.svelte';
  import { onMount } from 'svelte';
  import type { Action } from 'svelte/action';

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
    ensureGlobalListener();
    return () => {
      registry.delete(id);
      if (activePopoverId === id) activePopoverId = null;
    };
  });

  $effect(() => {
    if (triggerEl) {
      registry.set(id, { trigger: triggerEl, popover: popoverEl });
    }
  });
</script>

<button
  bind:this={triggerEl}
  type="button"
  onclick={toggle}
  class="rounded-lg px-2 py-1 text-xs text-text-muted transition-colors hover:text-text-secondary"
  title="Emoji"
>
  {isOpen ? '✕' : '😀'}
</button>

{#if isOpen}
  <div bind:this={popoverEl} class="fixed z-50" style={popoverStyle} use:portal>
    <EmojiPicker onSelect={handleSelect} />
  </div>
{/if}
