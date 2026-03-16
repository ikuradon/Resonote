<script lang="ts">
  import { goto } from '$app/navigation';
  import { parseContentUrl } from '../content/registry.js';
  import { toBase64url, extractTimeParam } from '../content/url-utils.js';
  import { t } from '../i18n/t.js';

  let url = $state('');
  let error = $state('');

  const placeholders = $derived.by(() => [
    t('track.placeholder.youtube'),
    t('track.placeholder.spotify'),
    t('track.placeholder.soundcloud'),
    t('track.placeholder.podcast'),
    t('track.placeholder.vimeo'),
    t('track.placeholder.mixcloud'),
    t('track.placeholder.audio'),
    t('track.placeholder.niconico'),
    t('track.placeholder.podbean')
  ]);

  let placeholderIndex = $state(0);
  let placeholderVisible = $state(true);

  $effect(() => {
    const interval = setInterval(() => {
      placeholderVisible = false;
      setTimeout(() => {
        placeholderIndex = (placeholderIndex + 1) % placeholders.length;
        placeholderVisible = true;
      }, 300);
    }, 3000);
    return () => clearInterval(interval);
  });

  function submit() {
    error = '';
    const trimmed = url.trim();
    if (!trimmed) return;

    const contentId = parseContentUrl(trimmed);

    if (contentId) {
      const timeSec = extractTimeParam(trimmed);
      const timeQuery = timeSec > 0 ? `?t=${timeSec}` : '';
      goto(
        `/${contentId.platform}/${contentId.type}/${encodeURIComponent(contentId.id)}${timeQuery}`
      );
      return;
    }

    // No provider matched — try resolve page for auto-discovery
    // Only for URLs that look like URLs (have a scheme or domain-like pattern)
    try {
      new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    } catch {
      error = t('track.unsupported');
      return;
    }

    const encoded = toBase64url(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    goto(`/resolve/${encoded}`);
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
      placeholder={placeholders[placeholderIndex]}
      data-testid="track-url-input"
      class="flex-1 rounded-xl border border-border bg-surface-1 px-4 py-3 text-sm text-text-primary transition-all duration-200 focus:border-accent focus:ring-1 focus:ring-accent/30 focus:outline-none"
      style="--placeholder-opacity: {placeholderVisible ? 1 : 0}"
    />
    <button
      type="submit"
      disabled={!url.trim()}
      data-testid="track-submit-button"
      class="rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-surface-0 transition-all duration-200 hover:bg-accent-hover hover:shadow-[0_0_20px_rgba(201,162,86,0.2)] disabled:opacity-30 disabled:hover:shadow-none"
    >
      {t('track.go')}
    </button>
  </div>
  {#if error}
    <p class="animate-fade-in text-sm text-error">{error}</p>
  {/if}
</form>

<style>
  input::placeholder {
    opacity: var(--placeholder-opacity, 1);
    transition: opacity 0.3s ease;
    color: var(--color-text-muted);
  }
</style>
