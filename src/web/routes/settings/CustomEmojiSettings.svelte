<script lang="ts">
  import { onMount } from 'svelte';

  import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
  import { getAuth } from '$shared/browser/auth.js';
  import {
    clearCustomEmojiCache,
    getCustomEmojiDiagnostics,
    refreshCustomEmojiDiagnostics,
    resetCustomEmojiDiagnosticsForPubkey
  } from '$shared/browser/custom-emoji-diagnostics.js';
  import { t } from '$shared/i18n/t.js';

  import {
    customEmojiStatusMessage,
    formatAppTimestampMs,
    formatNostrTimestampSec
  } from './custom-emoji-settings-view-model.js';

  const auth = getAuth();
  let diagnostics = $derived(getCustomEmojiDiagnostics());
  let confirmClear = $state(false);
  let clearError = $state<string | null>(null);

  $effect(() => {
    resetCustomEmojiDiagnosticsForPubkey(auth.pubkey);
  });

  onMount(() => {
    if (auth.pubkey) void refreshCustomEmojiDiagnostics(auth.pubkey);
  });

  async function handleRefresh() {
    if (!auth.pubkey) return;
    await refreshCustomEmojiDiagnostics(auth.pubkey);
  }

  async function handleClear() {
    clearError = null;
    try {
      await clearCustomEmojiCache();
      confirmClear = false;
    } catch (error) {
      clearError = error instanceof Error ? error.message : String(error);
    }
  }
</script>

<section class="rounded-2xl border border-border bg-surface-1 p-6 space-y-5">
  <div class="flex items-center justify-between gap-3">
    <h2 class="font-display text-lg font-semibold text-text-primary">
      {t('settings.custom_emoji.title')}
    </h2>
    {#if auth.pubkey}
      <button
        type="button"
        onclick={handleRefresh}
        disabled={diagnostics.isRefreshing || diagnostics.isClearing}
        class="rounded-lg bg-surface-2 px-3 py-1.5 text-xs text-text-muted transition-colors hover:bg-surface-3 hover:text-text-secondary disabled:opacity-50"
      >
        {diagnostics.isRefreshing
          ? t('settings.custom_emoji.refreshing')
          : t('settings.custom_emoji.refresh')}
      </button>
    {/if}
  </div>

  {#if !auth.pubkey}
    <p class="text-sm text-text-muted">{t('settings.custom_emoji.not_logged_in')}</p>
  {:else}
    <p class="text-sm text-text-muted">{customEmojiStatusMessage(diagnostics, t)}</p>
    <div class="grid grid-cols-2 gap-2 text-xs text-text-muted">
      <span
        >{t('settings.custom_emoji.emoji_sets', { count: diagnostics.summary.categoryCount })}</span
      >
      <span>{t('settings.custom_emoji.emojis', { count: diagnostics.summary.emojiCount })}</span>
      {#if diagnostics.listEvent}
        <span>{t('settings.custom_emoji.list_updated')}</span>
        <span>{formatNostrTimestampSec(diagnostics.listEvent.createdAtSec)}</span>
      {/if}
      <span>{t('settings.custom_emoji.last_checked')}</span>
      <span>{formatAppTimestampMs(diagnostics.lastCheckedAtMs, t)}</span>
    </div>
  {/if}

  <div class="border-t border-border-subtle pt-3">
    <h3 class="text-sm font-medium text-text-secondary">{t('settings.custom_emoji.advanced')}</h3>
    <button
      type="button"
      onclick={() => (confirmClear = true)}
      disabled={diagnostics.isClearing}
      class="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50"
    >
      {t('settings.custom_emoji.reset_cache')}
    </button>
  </div>
</section>

<ConfirmDialog
  open={confirmClear}
  title={t('settings.custom_emoji.reset_title')}
  message={clearError ?? t('settings.custom_emoji.reset_message')}
  variant="danger"
  confirmLabel={t('settings.custom_emoji.reset_confirm')}
  cancelLabel={t('confirm.cancel')}
  onConfirm={handleClear}
  onCancel={() => (confirmClear = false)}
/>
