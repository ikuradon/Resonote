<script lang="ts">
  import { t } from '$shared/i18n/t.js';

  interface Props {
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: 'danger' | 'default';
    onConfirm: () => void;
    onCancel: () => void;
  }

  let {
    open,
    title,
    message,
    confirmLabel = 'Delete',
    cancelLabel = 'Cancel',
    variant = 'danger',
    onConfirm,
    onCancel
  }: Props = $props();

  let dialogEl: HTMLDivElement | undefined = $state();
  let cancelBtn: HTMLButtonElement | undefined = $state();

  // Focus trap: focus cancel button when dialog opens
  $effect(() => {
    if (open && cancelBtn) {
      cancelBtn.focus();
    }
  });

  function handleKeydown(e: KeyboardEvent) {
    if (!open) return;

    if (e.key === 'Escape') {
      onCancel();
      return;
    }

    if (e.key === 'Tab' && dialogEl) {
      const focusable = dialogEl.querySelectorAll<HTMLElement>(
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
    bind:this={dialogEl}
    class="fixed inset-0 z-50 flex items-center justify-center"
    role="dialog"
    aria-modal="true"
    aria-labelledby="confirm-title"
  >
    <!-- Backdrop -->
    <button
      type="button"
      class="absolute inset-0 bg-black/60 backdrop-blur-sm"
      onclick={onCancel}
      aria-label={t('dialog.close')}
      tabindex="-1"
    ></button>

    <!-- Dialog -->
    <div
      class="animate-slide-up relative mx-3 w-full max-w-[calc(100vw-1.5rem)] sm:max-w-sm rounded-2xl border border-border bg-surface-1 p-6 shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
    >
      <h3 id="confirm-title" class="mb-2 text-sm font-semibold text-text-primary">{title}</h3>
      <p class="mb-6 text-sm leading-relaxed text-text-secondary">{message}</p>
      <div class="flex justify-end gap-3">
        <button
          bind:this={cancelBtn}
          type="button"
          onclick={onCancel}
          class="rounded-lg px-4 py-2 text-sm font-medium text-text-muted transition-colors hover:text-text-secondary"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onclick={onConfirm}
          class="rounded-lg px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:brightness-110
            {variant === 'danger' ? 'bg-error' : 'bg-accent hover:bg-accent-hover'}"
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  </div>
{/if}
