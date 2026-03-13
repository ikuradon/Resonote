<script lang="ts">
  import { goto } from '$app/navigation';
  import { parseContentUrl } from '../content/registry.js';

  let url = $state('');
  let error = $state('');

  function submit() {
    error = '';
    const contentId = parseContentUrl(url.trim());
    if (!contentId) {
      error = 'Unsupported URL';
      return;
    }
    goto(`/${contentId.platform}/${contentId.type}/${contentId.id}`);
  }
</script>

<form
  onsubmit={(e) => {
    e.preventDefault();
    submit();
  }}
  class="w-full space-y-3"
>
  <div class="flex gap-3">
    <input
      type="text"
      bind:value={url}
      placeholder="Paste a Spotify or YouTube URL..."
      class="flex-1 rounded-xl border border-border bg-surface-1 px-4 py-3 text-sm text-text-primary placeholder-text-muted transition-all duration-200 focus:border-accent focus:ring-1 focus:ring-accent/30 focus:outline-none"
    />
    <button
      type="submit"
      disabled={!url.trim()}
      class="rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-surface-0 transition-all duration-200 hover:bg-accent-hover hover:shadow-[0_0_20px_rgba(201,162,86,0.2)] disabled:opacity-30 disabled:hover:shadow-none"
    >
      Go
    </button>
  </div>
  {#if error}
    <p class="animate-fade-in text-sm text-error">{error}</p>
  {/if}
</form>
