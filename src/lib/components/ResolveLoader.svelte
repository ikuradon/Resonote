<script lang="ts">
  import { goto } from '$app/navigation';
  import { fromBase64url, toBase64url } from '$lib/content/url-utils.js';
  import { resolveByApi } from '$lib/content/podcast-resolver.js';
  import { t } from '../i18n/t.js';

  interface Props {
    encodedUrl: string;
  }

  let { encodedUrl }: Props = $props();

  let status = $state<'loading' | 'error'>('loading');
  let errorMessage = $state('');

  $effect(() => {
    const url = fromBase64url(encodedUrl);
    resolve(url);
  });

  async function resolve(url: string) {
    try {
      const data = await resolveByApi(url);

      if (data.error) {
        status = 'error';
        errorMessage =
          data.error === 'rss_not_found'
            ? t('resolve.error.not_found')
            : t('resolve.error.parse_failed');
        return;
      }

      if (data.type === 'redirect' && data.feedUrl) {
        goto(`/podcast/feed/${toBase64url(data.feedUrl)}`);
        return;
      }
    } catch {
      status = 'error';
      errorMessage = t('resolve.error.parse_failed');
    }
  }
</script>

<div class="flex min-h-[200px] items-center justify-center">
  {#if status === 'loading'}
    <div class="flex flex-col items-center gap-3">
      <div
        class="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent"
      ></div>
      <p class="text-text-secondary">{t('resolve.loading')}</p>
    </div>
  {:else}
    <div class="rounded-2xl border border-border-subtle bg-surface-secondary p-6 text-center">
      <p class="text-text-secondary">{errorMessage}</p>
    </div>
  {/if}
</div>
