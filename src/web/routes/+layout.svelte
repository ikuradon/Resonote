<script lang="ts">
  import { onMount } from 'svelte';
  import type { Snippet } from 'svelte';
  import LoginButton from '$lib/components/LoginButton.svelte';
  import RelayStatus from '$lib/components/RelayStatus.svelte';
  import { initAuth } from '$lib/stores/auth.svelte.js';
  import { initExtensionListener, isExtensionMode } from '$lib/stores/extension.svelte.js';
  import '../app.css';

  let { children }: { children: Snippet } = $props();

  onMount(() => {
    initAuth();
    initExtensionListener();
  });
</script>

<div class="noise min-h-screen bg-surface-0 font-body text-text-primary">
  <!-- Ambient glow -->
  <div
    class="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 h-[600px] w-[800px] rounded-full opacity-[0.04] blur-[120px]"
    style="background: radial-gradient(circle, var(--color-accent) 0%, transparent 70%)"
  ></div>

  {#if isExtensionMode()}
    <header class="glass sticky top-0 z-40 border-b border-border-subtle">
      <div class="mx-auto flex max-w-3xl items-center justify-end px-5 py-3">
        <LoginButton />
      </div>
    </header>
  {:else}
    <header class="glass sticky top-0 z-40 border-b border-border-subtle">
      <div class="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
        <a
          href="/"
          class="font-display text-xl font-semibold tracking-wide text-accent transition-colors hover:text-accent-hover"
        >
          Resonote
        </a>
        <div class="flex items-center gap-3">
          <RelayStatus />
          <LoginButton />
        </div>
      </div>
    </header>
  {/if}

  <main class="relative mx-auto max-w-3xl px-5 py-10">
    {@render children()}
  </main>
</div>
