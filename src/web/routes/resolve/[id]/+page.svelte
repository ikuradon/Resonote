<script lang="ts">
  import { page } from '$app/state';
  import ResolveLoader from '$lib/components/ResolveLoader.svelte';

  let encodedUrl = $derived(page.params.id ?? '');
</script>

<svelte:head>
  <title>URL 解析中... | Resonote</title>
</svelte:head>

<div class="mx-auto max-w-2xl px-4 py-8">
  {#if encodedUrl}
    <ResolveLoader {encodedUrl} />
  {:else}
    <p class="text-center text-text-secondary">無効なURLです</p>
  {/if}
</div>
