<script lang="ts">
  import { neventEncode } from 'nostr-tools/nip19';

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
    onBroadcast,
  }: Props = $props();

  let open = $state(false);

  function toggle() {
    open = !open;
  }

  function close() {
    open = false;
  }

  async function copyId() {
    const nevent = neventEncode({ id: eventId, author: authorPubkey });
    await navigator.clipboard.writeText(`nostr:${nevent}`);
    toastSuccess(t('menu.copied'));
    close();
  }

  function handleQuote() {
    onQuote?.();
    close();
  }

  function handleCustomEmoji() {
    onCustomEmoji?.();
    close();
  }

  function handleBroadcast() {
    onBroadcast?.();
    close();
  }

  function handleMuteUser() {
    onMuteUser?.();
    close();
  }

  function handleMuteThread() {
    onMuteThread?.();
    close();
  }

  function handleDelete() {
    onDelete?.();
    close();
  }

  const showQuote = $derived(!inlineActions?.has('reply'));
  const showCustomEmoji = $derived(!inlineActions?.has('emoji'));
  const showMuteUser = $derived(canMute && !isOwn && !!onMuteUser);
  const showSeparator = $derived(showMuteUser || !!onMuteThread || (isOwn && !!onDelete));
</script>

<div class="relative">
  <button
    onclick={toggle}
    class="rounded p-1 text-text-muted transition-colors hover:text-text-secondary"
    aria-label="More actions"
    aria-expanded={open}
  >
    ⋮
  </button>

  {#if open}
    <!-- Backdrop -->
    <button
      class="fixed inset-0 z-40"
      onclick={close}
      aria-label="Close menu"
      tabindex="-1"
    ></button>

    <!-- Popover -->
    <div class="absolute right-0 top-8 z-50 min-w-[180px] rounded-lg border border-border bg-surface-1 py-1 shadow-xl">
      {#if showQuote}
        <button
          onclick={handleQuote}
          class="flex w-full items-center gap-2 px-3 py-2 text-xs text-text-secondary transition-colors hover:bg-surface-2"
        >
          <span>💬</span>
          {t('menu.quote')}
        </button>
      {/if}

      {#if showCustomEmoji}
        <button
          onclick={handleCustomEmoji}
          class="flex w-full items-center gap-2 px-3 py-2 text-xs text-text-secondary transition-colors hover:bg-surface-2"
        >
          <span>😀</span>
          {t('menu.custom_emoji')}
        </button>
      {/if}

      <button
        onclick={copyId}
        class="flex w-full items-center gap-2 px-3 py-2 text-xs text-text-secondary transition-colors hover:bg-surface-2"
      >
        <span>📋</span>
        {t('menu.copy_id')}
      </button>

      {#if onBroadcast}
        <button
          onclick={handleBroadcast}
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
          onclick={handleMuteUser}
          class="flex w-full items-center gap-2 px-3 py-2 text-xs text-text-secondary transition-colors hover:bg-surface-2"
        >
          <span>🔇</span>
          {t('menu.mute_user')}
        </button>
      {/if}

      {#if onMuteThread}
        <button
          onclick={handleMuteThread}
          class="flex w-full items-center gap-2 px-3 py-2 text-xs text-text-secondary transition-colors hover:bg-surface-2"
        >
          <span>🔕</span>
          {t('menu.mute_thread')}
        </button>
      {/if}

      {#if isOwn && onDelete}
        <button
          onclick={handleDelete}
          class="flex w-full items-center gap-2 px-3 py-2 text-xs text-red-400 transition-colors hover:bg-surface-2"
        >
          <span>🗑</span>
          {t('menu.delete')}
        </button>
      {/if}
    </div>
  {/if}
</div>
