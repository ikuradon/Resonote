<script lang="ts">
  import { t } from '$shared/i18n/t.js';

  interface Props {
    open: boolean;
    onClose: () => void;
  }

  const { open, onClose }: Props = $props();

  const sections = [
    {
      label: () => t('shortcuts.comment'),
      items: [
        { keys: ['n'], desc: () => t('shortcuts.focus_form') },
        { keys: ['Ctrl', 'Enter'], desc: () => t('shortcuts.submit') },
        { keys: ['j'], desc: () => t('shortcuts.next_comment') },
        { keys: ['k'], desc: () => t('shortcuts.prev_comment') },
        { keys: ['r'], desc: () => t('shortcuts.reply') },
        { keys: ['l'], desc: () => t('shortcuts.like') },
        { keys: ['Esc'], desc: () => t('shortcuts.clear_selection') }
      ]
    },
    {
      label: () => t('shortcuts.tab'),
      items: [
        { keys: ['f'], desc: () => t('shortcuts.flow_tab') },
        { keys: ['s'], desc: () => t('shortcuts.shout_tab') },
        { keys: ['i'], desc: () => t('shortcuts.info_tab') }
      ]
    },
    {
      label: () => t('shortcuts.playback'),
      items: [
        { keys: ['p'], desc: () => t('shortcuts.play_pause') },
        { keys: ['\u2190'], desc: () => t('shortcuts.seek_back') },
        { keys: ['\u2192'], desc: () => t('shortcuts.seek_forward') }
      ]
    },
    {
      label: () => t('shortcuts.other'),
      items: [
        { keys: ['b'], desc: () => t('shortcuts.bookmark') },
        { keys: ['Shift', 'S'], desc: () => t('shortcuts.share') },
        { keys: ['?'], desc: () => t('shortcuts.show_help') }
      ]
    }
  ];

  function handleBackdropClick(e: MouseEvent): void {
    if (e.target === e.currentTarget) onClose();
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
  }
</script>

{#if open}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
    role="dialog"
    aria-modal="true"
    aria-label={t('shortcuts.title')}
    tabindex="-1"
    onclick={handleBackdropClick}
    onkeydown={handleKeydown}
  >
    <div
      class="mx-4 max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-surface-0 p-6 shadow-xl"
    >
      <h2 class="mb-4 font-display text-lg font-semibold text-text-primary">
        {t('shortcuts.title')}
      </h2>

      {#each sections as section, sectionIdx (sectionIdx)}
        <div class="mb-4">
          <h3 class="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
            {section.label()}
          </h3>
          <div class="space-y-1.5">
            {#each section.items as item, itemIdx (itemIdx)}
              <div class="flex items-center justify-between py-1">
                <span class="text-sm text-text-secondary">{item.desc()}</span>
                <div class="flex items-center gap-1">
                  {#each item.keys as key, keyIdx (keyIdx)}
                    <kbd
                      class="inline-flex min-w-[1.75rem] items-center justify-center rounded-md border border-border-subtle bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-text-primary"
                    >
                      {key}
                    </kbd>
                  {/each}
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/each}

      <div class="mt-4 flex justify-end">
        <button
          type="button"
          onclick={onClose}
          class="rounded-lg bg-surface-2 px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-3"
        >
          {t('confirm.ok')}
        </button>
      </div>
    </div>
  </div>
{/if}
