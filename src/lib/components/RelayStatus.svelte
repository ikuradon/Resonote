<script lang="ts">
  import { onMount } from 'svelte';
  import { getRelays, initRelayStatus, type ConnectionState } from '../stores/relays.svelte.js';

  let open = $state(false);
  let relays = $derived(getRelays());
  let containerEl: HTMLDivElement | undefined;

  onMount(() => {
    initRelayStatus();
  });

  $effect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!containerEl?.contains(e.target as Node)) {
        open = false;
      }
    };
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  });

  function stateColor(state: ConnectionState): string {
    switch (state) {
      case 'connected':
        return 'bg-emerald-400';
      case 'connecting':
      case 'retrying':
        return 'bg-amber-400 animate-pulse';
      case 'waiting-for-retrying':
      case 'dormant':
      case 'initialized':
        return 'bg-text-muted';
      case 'error':
      case 'rejected':
      case 'terminated':
        return 'bg-error';
    }
  }

  function stateLabel(state: ConnectionState): string {
    switch (state) {
      case 'connected':
        return 'Connected';
      case 'connecting':
        return 'Connecting';
      case 'retrying':
        return 'Retrying';
      case 'waiting-for-retrying':
        return 'Waiting';
      case 'dormant':
        return 'Dormant';
      case 'initialized':
        return 'Ready';
      case 'error':
        return 'Error';
      case 'rejected':
        return 'Rejected';
      case 'terminated':
        return 'Closed';
    }
  }

  let connectedCount = $derived(relays.filter((r) => r.state === 'connected').length);

  function shortUrl(url: string): string {
    return url.replace(/^wss?:\/\//, '');
  }
</script>

<div class="relative" bind:this={containerEl}>
  <button
    onclick={() => (open = !open)}
    class="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-text-muted transition-colors hover:text-text-secondary"
    title="Relay status"
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

  {#if open}
    <div
      class="absolute top-full right-0 z-50 mt-2 w-64 rounded-xl border border-border bg-surface-1 p-3 shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
    >
      <div class="mb-2 flex items-center justify-between">
        <span class="text-xs font-medium text-text-secondary">Relays</span>
        <span class="text-xs text-text-muted">{connectedCount} connected</span>
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
