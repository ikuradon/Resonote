<script lang="ts">
  import { onMount } from 'svelte';
  import {
    getRelays,
    initRelayStatus,
    shortUrl,
    stateColor,
    type ConnectionState
  } from '../stores/relays.svelte.js';
  import { t, type TranslationKey } from '../i18n/t.js';
  import MobileOverlay from './MobileOverlay.svelte';

  let open = $state(false);
  let relays = $derived(getRelays());
  let containerEl: HTMLDivElement | undefined;

  let isDesktop = $state(true);
  $effect(() => {
    const mql = window.matchMedia('(min-width: 1024px)');
    isDesktop = mql.matches;
    function handler(e: MediaQueryListEvent) {
      isDesktop = e.matches;
    }
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  });

  onMount(() => {
    initRelayStatus();
  });

  $effect(() => {
    if (!open || !isDesktop) return;
    const handler = (e: MouseEvent) => {
      if (!containerEl?.contains(e.target as Node)) {
        open = false;
      }
    };
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  });

  const stateKeys: Record<ConnectionState, TranslationKey> = {
    connected: 'relay.state.connected',
    connecting: 'relay.state.connecting',
    retrying: 'relay.state.retrying',
    'waiting-for-retrying': 'relay.state.waiting',
    dormant: 'relay.state.dormant',
    initialized: 'relay.state.ready',
    error: 'relay.state.error',
    rejected: 'relay.state.rejected',
    terminated: 'relay.state.closed'
  };

  function stateLabel(state: ConnectionState): string {
    return t(stateKeys[state]);
  }

  let connectedCount = $derived(relays.filter((r) => r.state === 'connected').length);
</script>

<div class="relative" bind:this={containerEl}>
  <button
    onclick={() => (open = !open)}
    class="flex items-center gap-1.5 min-h-11 rounded-lg px-2 py-1 text-xs text-text-muted transition-colors hover:text-text-secondary"
    title={t('relay.title')}
  >
    <span class="relative flex h-2 w-2">
      {#if connectedCount > 0}
        <span
          class="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-40"
        ></span>
      {/if}
      <span
        class="relative inline-flex h-2 w-2 rounded-full {connectedCount > 0
          ? 'bg-emerald-400'
          : 'bg-error'}"
      ></span>
    </span>
    {connectedCount}/{relays.length}
  </button>

  {#if open && isDesktop}
    <div
      class="absolute top-full right-0 z-50 mt-2 w-64 rounded-xl border border-border bg-surface-1 p-3 shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
    >
      <div class="mb-2 flex items-center justify-between">
        <span class="text-xs font-medium text-text-secondary">{t('relay.heading')}</span>
        <span class="text-xs text-text-muted"
          >{t('relay.connected', { count: connectedCount })}</span
        >
      </div>
      <div class="space-y-1.5">
        {#each relays as relay (relay.url)}
          <div
            class="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-2"
          >
            <span class="h-1.5 w-1.5 flex-shrink-0 rounded-full {stateColor(relay.state)}"></span>
            <span class="flex-1 truncate text-xs text-text-primary">{shortUrl(relay.url)}</span>
            <span class="text-[10px] text-text-muted">{stateLabel(relay.state)}</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

{#if !isDesktop}
  <MobileOverlay {open} onclose={() => (open = false)} title={t('relay.heading')}>
    <div class="mb-3 text-sm text-text-muted">
      {t('relay.connected', { count: connectedCount })}
    </div>
    <div class="space-y-2">
      {#each relays as relay (relay.url)}
        <div
          class="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-surface-2"
        >
          <span class="h-2 w-2 flex-shrink-0 rounded-full {stateColor(relay.state)}"></span>
          <span class="flex-1 truncate text-sm text-text-primary">{shortUrl(relay.url)}</span>
          <span class="text-xs text-text-muted">{stateLabel(relay.state)}</span>
        </div>
      {/each}
    </div>
  </MobileOverlay>
{/if}
