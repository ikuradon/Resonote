<script lang="ts">
  import { dismiss, getToasts, type ToastType } from '$shared/browser/toast.js';
  import { t } from '$shared/i18n/t.js';

  const TOAST_STYLE: Record<
    ToastType,
    { iconPath: string; borderColor: string; iconColor: string }
  > = {
    success: {
      iconPath: 'M20 6L9 17l-5-5',
      borderColor: 'border-accent/40',
      iconColor: 'text-accent'
    },
    error: {
      iconPath: 'M18 6L6 18M6 6l12 12',
      borderColor: 'border-error/40',
      iconColor: 'text-error'
    },
    info: {
      iconPath: 'M12 16v-4M12 8h.01',
      borderColor: 'border-border',
      iconColor: 'text-text-muted'
    }
  };
</script>

<div
  class="pointer-events-none fixed inset-x-0 bottom-0 z-[999] flex flex-col items-center gap-2 px-4 pb-6"
  aria-live="polite"
  aria-atomic="false"
>
  {#each getToasts() as toast (toast.id)}
    {@const style = TOAST_STYLE[toast.type]}
    <div
      class="pointer-events-auto animate-slide-up rounded-xl border {style.borderColor} bg-surface-1/95 px-4 py-3 shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-sm"
      role={toast.type === 'error' ? 'alert' : 'status'}
    >
      <div class="flex items-center gap-3">
        <svg
          class="h-4 w-4 shrink-0 {style.iconColor}"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d={style.iconPath} />
        </svg>
        <span class="text-sm text-text-primary">{toast.message}</span>
        <button
          type="button"
          onclick={() => dismiss(toast.id)}
          class="ml-2 shrink-0 rounded p-0.5 text-text-muted transition-colors hover:text-text-secondary"
          aria-label={t('toast.dismiss')}
        >
          <svg
            class="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  {/each}
</div>
