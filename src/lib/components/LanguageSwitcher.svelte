<script lang="ts">
  import { getLocale, setLocale } from '$shared/browser/locale.js';
  import { LOCALES, type Locale } from '$shared/i18n/locales.js';
  import { isNodeInsideElements, manageClickOutside } from '$shared/browser/click-outside.js';

  let open = $state(false);
  let containerEl: HTMLDivElement | undefined;

  manageClickOutside({
    active: () => open,
    isInside: (target) => isNodeInsideElements(target, [containerEl]),
    onOutside: () => {
      open = false;
    }
  });

  function select(code: string) {
    setLocale(code as Locale);
    open = false;
  }

  let currentLocale = $derived(LOCALES.find((l) => l.code === getLocale()) ?? LOCALES[0]);
</script>

<div class="relative" bind:this={containerEl}>
  <button
    type="button"
    onclick={() => (open = !open)}
    aria-expanded={open}
    class="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-text-muted transition-colors hover:bg-surface-1 hover:text-text-secondary"
  >
    <span>{currentLocale.flag}</span>
    <span>{currentLocale.code.toUpperCase()}</span>
  </button>

  {#if open}
    <div
      class="absolute right-0 top-full z-50 mt-1 min-w-28 rounded-lg border border-border bg-surface-0 py-1 shadow-lg"
    >
      {#each LOCALES as locale (locale.code)}
        <button
          type="button"
          onclick={() => select(locale.code)}
          class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors
            {locale.code === getLocale()
            ? 'bg-accent/10 text-accent'
            : 'text-text-secondary hover:bg-surface-1'}"
        >
          <span>{locale.flag}</span>
          <span>{locale.label}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>
