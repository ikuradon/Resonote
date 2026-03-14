<script lang="ts">
  import { t } from '../i18n/t.js';

  interface Props {
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm: () => void;
    onCancel: () => void;
  }

  let {
    open,
    title,
    message,
    confirmLabel = 'Delete',
    cancelLabel = 'Cancel',
    onConfirm,
    onCancel
  }: Props = $props();

  function handleKeydown(e: KeyboardEvent) {
    if (open && e.key === 'Escape') onCancel();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <div
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
      class="animate-slide-up relative w-full max-w-sm rounded-2xl border border-border bg-surface-1 p-6 shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
    >
      <h3 id="confirm-title" class="mb-2 text-sm font-semibold text-text-primary">{title}</h3>
      <p class="mb-6 text-sm leading-relaxed text-text-secondary">{message}</p>
      <div class="flex justify-end gap-3">
        <button
          type="button"
          onclick={onCancel}
          class="rounded-lg px-4 py-2 text-sm font-medium text-text-muted transition-colors hover:text-text-secondary"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onclick={onConfirm}
          class="rounded-lg bg-error px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:brightness-110"
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  </div>
{/if}
