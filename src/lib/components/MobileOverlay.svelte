<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    open: boolean;
    onclose: () => void;
    title?: string;
    children: Snippet;
  }

  let { open, onclose, title = '', children }: Props = $props();

  const titleId = `overlay-title-${Math.random().toString(36).slice(2, 8)}`;

  let overlayEl: HTMLDivElement | undefined = $state();
  let closeBtn: HTMLButtonElement | undefined = $state();

  // Body scroll lock
  $effect(() => {
    if (open) {
      const original = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = original;
      };
    }
  });

  // Focus trap
  $effect(() => {
    if (open && closeBtn) {
      closeBtn.focus();
    }
  });

  function handleKeydown(e: KeyboardEvent) {
    if (!open || !overlayEl) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      onclose();
      return;
    }

    if (e.key === 'Tab') {
      const focusable = overlayEl.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <div
    bind:this={overlayEl}
    role="dialog"
    aria-modal="true"
    aria-labelledby={title ? titleId : undefined}
    class="fixed inset-0 z-50 flex flex-col bg-surface-0/95 backdrop-blur-sm"
  >
    <!-- Header -->
    <div class="flex items-center justify-between border-b border-border-subtle px-5 py-4">
      {#if title}
        <h2 id={titleId} class="font-display text-lg font-semibold text-text-primary">{title}</h2>
      {:else}
        <div id={titleId}></div>
      {/if}
      <button
        bind:this={closeBtn}
        type="button"
        data-overlay-close
        onclick={onclose}
        class="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-1 hover:text-text-secondary"
        aria-label="Close"
      >
        <svg
          aria-hidden="true"
          class="h-5 w-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
    <!-- Content -->
    <div class="flex-1 overflow-y-auto px-5 py-4">
      {@render children()}
    </div>
  </div>
{/if}
