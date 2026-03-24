<script lang="ts">
  import { goto } from '$app/navigation';
  import { createResolveLoaderViewModel } from '$features/content-resolution/ui/resolve-loader-view-model.svelte.js';
  import { t } from '$shared/i18n/t.js';

  import WaveformLoader from './WaveformLoader.svelte';

  interface Props {
    encodedUrl: string;
  }

  let { encodedUrl }: Props = $props();
  const vm = createResolveLoaderViewModel({ getEncodedUrl: () => encodedUrl, navigate: goto });
</script>

<div class="flex min-h-[200px] items-center justify-center">
  {#if vm.status === 'loading'}
    <div class="flex flex-col items-center gap-3" role="status">
      <WaveformLoader height="h-8" />
      <p class="text-text-secondary">{t('resolve.loading')}</p>
    </div>
  {:else}
    <div class="rounded-2xl border border-border-subtle bg-surface-secondary p-6 text-center">
      <p class="text-text-secondary">{vm.errorMessage}</p>
    </div>
  {/if}
</div>
