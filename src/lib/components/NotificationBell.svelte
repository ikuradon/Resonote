<script lang="ts">
  import { getNotifications, markAllAsRead } from '../stores/notifications.svelte.js';
  import { getDisplayName, fetchProfiles } from '../stores/profile.svelte.js';
  import { t } from '../i18n/t.js';
  import { typeIcon, typeLabel, relativeTime } from '../utils/notification-helpers.js';
  import { getContentPathFromTags } from '../nostr/content-link.js';
  import { untrack } from 'svelte';

  const notifs = getNotifications();

  let open = $state(false);
  let containerEl: HTMLDivElement | undefined;

  // Close on outside click
  $effect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!containerEl?.contains(e.target as Node)) {
        open = false;
      }
    };
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  });

  // When dropdown opens, mark as read and fetch profiles
  $effect(() => {
    if (open) {
      markAllAsRead();
      const pubkeys = [...new Set(notifs.items.slice(0, 5).map((n) => n.pubkey))];
      untrack(() => fetchProfiles(pubkeys));
    }
  });

  let latest5 = $derived(notifs.items.slice(0, 5));

  function contentPreview(content: string): string {
    return content.length > 50 ? content.slice(0, 48) + '\u2026' : content;
  }
</script>

<div class="relative" bind:this={containerEl}>
  <button
    onclick={() => (open = !open)}
    class="relative flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-1 hover:text-text-secondary"
    title={t('notification.title')}
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      class="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
    {#if notifs.unreadCount > 0}
      <span
        class="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white"
      >
        {notifs.unreadCount > 99 ? '99+' : notifs.unreadCount}
      </span>
    {/if}
  </button>

  {#if open}
    <div
      class="absolute top-full right-0 z-50 mt-2 w-80 rounded-xl border border-border bg-surface-1 shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
    >
      <div class="border-b border-border-subtle px-4 py-3">
        <span class="text-sm font-medium text-text-secondary">{t('notification.title')}</span>
      </div>

      {#if latest5.length === 0}
        <div class="px-4 py-8 text-center text-sm text-text-muted">
          {t('notification.empty')}
        </div>
      {:else}
        <div class="max-h-80 overflow-y-auto">
          {#each latest5 as notif (notif.id)}
            {@const path = getContentPathFromTags(notif.tags)}
            {#if path}
              <a
                href={path}
                onclick={() => (open = false)}
                class="flex gap-3 px-4 py-3 transition-colors hover:bg-surface-2"
              >
                <span class="mt-0.5 text-sm">{typeIcon(notif.type)}</span>
                <div class="min-w-0 flex-1">
                  <p class="text-xs text-text-primary">
                    <span class="font-medium text-accent">{getDisplayName(notif.pubkey)}</span>
                    {typeLabel(notif.type)}
                  </p>
                  {#if notif.content}
                    <p class="mt-0.5 truncate text-xs text-text-muted">
                      {contentPreview(notif.content)}
                    </p>
                  {/if}
                </div>
                <span class="shrink-0 text-[10px] text-text-muted"
                  >{relativeTime(notif.createdAt)}</span
                >
              </a>
            {:else}
              <div class="flex gap-3 px-4 py-3">
                <span class="mt-0.5 text-sm">{typeIcon(notif.type)}</span>
                <div class="min-w-0 flex-1">
                  <p class="text-xs text-text-primary">
                    <span class="font-medium text-accent">{getDisplayName(notif.pubkey)}</span>
                    {typeLabel(notif.type)}
                  </p>
                  {#if notif.content}
                    <p class="mt-0.5 truncate text-xs text-text-muted">
                      {contentPreview(notif.content)}
                    </p>
                  {/if}
                </div>
                <span class="shrink-0 text-[10px] text-text-muted"
                  >{relativeTime(notif.createdAt)}</span
                >
              </div>
            {/if}
          {/each}
        </div>
      {/if}

      <div class="border-t border-border-subtle px-4 py-2">
        <a
          href="/notifications"
          onclick={() => (open = false)}
          class="block text-center text-xs font-medium text-accent transition-colors hover:text-accent-hover"
        >
          {t('notification.view_all')}
        </a>
      </div>
    </div>
  {/if}
</div>
