<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { t } from '$shared/i18n/t.js';
  import { createNip19RouteViewModel } from '$features/nip19-resolver/ui/nip19-route-view-model.svelte.js';

  let param = $derived(page.params.nip19 ?? '');
  const vm = createNip19RouteViewModel({
    getValue: () => param,
    navigate: (path) => goto(path, { replaceState: true })
  });
</script>

<svelte:head>
  <title>Resonote</title>
</svelte:head>

{#if vm.loading}
  <div class="flex flex-col items-center gap-6 pt-20">
    <p class="font-display text-lg text-text-secondary">{t('nip19.loading')}</p>
  </div>
{:else if vm.error}
  <div class="flex flex-col items-center gap-6 pt-20">
    <p class="font-display text-lg text-text-secondary">{t(vm.error)}</p>
    {#if vm.error === 'nip19.not_comment' && vm.contentPath}
      <a
        href={vm.contentPath}
        class="rounded-xl bg-accent px-6 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:bg-accent-hover"
      >
        {t('nip19.view_content')}
      </a>
    {/if}
    <a href="/" class="text-sm text-accent transition-colors hover:text-accent-hover">
      {t('content.back_home')}
    </a>
  </div>
{/if}
