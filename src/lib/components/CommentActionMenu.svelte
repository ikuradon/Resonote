<script lang="ts">
  import { neventEncode } from 'nostr-tools/nip19';
  import { onMount } from 'svelte';
  import type { Action } from 'svelte/action';

  import { isNodeInsideElements, manageClickOutside } from '$shared/browser/click-outside.js';
  import { copyToClipboard } from '$shared/browser/clipboard.js';
  import { toastSuccess } from '$shared/browser/toast.js';
  import { t } from '$shared/i18n/t.js';

  interface Props {
    eventId: string;
    authorPubkey: string;
    isOwn: boolean;
    canMute: boolean;
    /** Actions already shown inline — exclude from menu */
    inlineActions?: Set<'reply' | 'like' | 'renote' | 'emoji'>;
    onQuote?: () => void;
    onCustomEmoji?: () => void;
    onMuteUser?: () => void;
    onMuteThread?: () => void;
    onDelete?: () => void;
    onBroadcast?: () => void;
  }

  const {
    eventId,
    authorPubkey,
    isOwn,
    canMute,
    inlineActions,
    onQuote,
    onCustomEmoji,
    onMuteUser,
    onMuteThread,
    onDelete,
    onBroadcast
  }: Props = $props();

  let open = $state(false);
  let triggerEl = $state<HTMLButtonElement | null>(null);
  let menuEl = $state<HTMLDivElement | null>(null);
  let popoverStyle = $state('');

  const MENU_WIDTH = 180;
  const MENU_HEIGHT = 280;

  function updatePosition() {
    if (!triggerEl) return;
    const rect = triggerEl.getBoundingClientRect();

    let left = rect.right - MENU_WIDTH;
    let top = rect.bottom + 4;

    if (left + MENU_WIDTH > window.innerWidth) left = window.innerWidth - MENU_WIDTH - 8;
    if (left < 8) left = 8;

    if (top + MENU_HEIGHT > window.innerHeight) top = rect.top - MENU_HEIGHT - 4;
    if (top < 8) top = 8;

    popoverStyle = `left:${left}px;top:${top}px`;
  }

  function toggle() {
    if (open) {
      open = false;
    } else {
      open = true;
      updatePosition();
    }
  }

  function close() {
    open = false;
  }

  /** Move the element to document.body to escape ancestor overflow/transforms. */
  const portal: Action = (node) => {
    document.body.appendChild(node);
    return {
      destroy() {
        node.remove();
      }
    };
  };

  onMount(() => {
    // Close on any scroll (menu position becomes stale)
    const onScroll = () => {
      if (open) open = false;
    };
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => {
      open = false;
      window.removeEventListener('scroll', onScroll, { capture: true });
    };
  });

  manageClickOutside({
    active: () => open,
    isInside: (target) => isNodeInsideElements(target, [triggerEl, menuEl]),
    onOutside: () => {
      open = false;
    }
  });

  function buildNevent(): string {
    return neventEncode({ id: eventId, author: authorPubkey });
  }

  async function copyId() {
    const ok = await copyToClipboard(`nostr:${buildNevent()}`);
    if (ok) toastSuccess(t('menu.copied'));
    close();
  }

  async function copyLink() {
    const url = `${window.location.origin}/${buildNevent()}`;
    const ok = await copyToClipboard(url);
    if (ok) toastSuccess(t('menu.copied'));
    close();
  }

  function act(fn?: () => void) {
    fn?.();
    close();
  }

  const showQuote = $derived(!inlineActions?.has('reply'));
  const showCustomEmoji = $derived(!inlineActions?.has('emoji'));
  const showMuteUser = $derived(canMute && !isOwn && !!onMuteUser);
  const showSeparator = $derived(showMuteUser || !!onMuteThread || (isOwn && !!onDelete));
</script>

<button
  bind:this={triggerEl}
  type="button"
  onclick={toggle}
  class="rounded p-1 text-text-muted transition-colors hover:text-text-secondary"
  aria-label="More actions"
  aria-expanded={open}
>
  ⋮
</button>

{#if open}
  <div
    bind:this={menuEl}
    class="fixed z-50 min-w-[180px] max-h-[280px] overflow-y-auto rounded-lg border border-border bg-surface-1 py-1 shadow-xl"
    style={popoverStyle}
    use:portal
  >
    {#if showQuote}
      <button
        onclick={() => act(onQuote)}
        class="flex w-full items-center gap-2 px-3 py-2 text-xs text-text-secondary transition-colors hover:bg-surface-2"
      >
        <span>💬</span>
        {t('menu.quote')}
      </button>
    {/if}

    {#if showCustomEmoji}
      <button
        onclick={() => act(onCustomEmoji)}
        class="flex w-full items-center gap-2 px-3 py-2 text-xs text-text-secondary transition-colors hover:bg-surface-2"
      >
        <span>😀</span>
        {t('menu.custom_emoji')}
      </button>
    {/if}

    <button
      onclick={copyLink}
      class="flex w-full items-center gap-2 px-3 py-2 text-xs text-text-secondary transition-colors hover:bg-surface-2"
    >
      <span>🔗</span>
      {t('menu.copy_link')}
    </button>

    <button
      onclick={copyId}
      class="flex w-full items-center gap-2 px-3 py-2 text-xs text-text-secondary transition-colors hover:bg-surface-2"
    >
      <span>📋</span>
      {t('menu.copy_id')}
    </button>

    {#if onBroadcast}
      <button
        onclick={() => act(onBroadcast)}
        class="flex w-full items-center gap-2 px-3 py-2 text-xs text-text-secondary transition-colors hover:bg-surface-2"
      >
        <span>📡</span>
        {t('menu.broadcast')}
      </button>
    {/if}

    {#if showSeparator}
      <div class="my-1 h-px bg-border-subtle"></div>
    {/if}

    {#if showMuteUser}
      <button
        onclick={() => act(onMuteUser)}
        class="flex w-full items-center gap-2 px-3 py-2 text-xs text-text-secondary transition-colors hover:bg-surface-2"
      >
        <span>🔇</span>
        {t('menu.mute_user')}
      </button>
    {/if}

    {#if onMuteThread}
      <button
        onclick={() => act(onMuteThread)}
        class="flex w-full items-center gap-2 px-3 py-2 text-xs text-text-secondary transition-colors hover:bg-surface-2"
      >
        <span>🔕</span>
        {t('menu.mute_thread')}
      </button>
    {/if}

    {#if isOwn && onDelete}
      <button
        onclick={() => act(onDelete)}
        class="flex w-full items-center gap-2 px-3 py-2 text-xs text-red-400 transition-colors hover:bg-surface-2"
      >
        <span>🗑</span>
        {t('menu.delete')}
      </button>
    {/if}
  </div>
{/if}
