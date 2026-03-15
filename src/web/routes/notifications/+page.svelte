<script lang="ts">
  import { getNotifications, markAllAsRead } from '$lib/stores/notifications.svelte.js';
  import { getDisplayName, getProfile, fetchProfiles } from '$lib/stores/profile.svelte.js';
  import { getAuth } from '$lib/stores/auth.svelte.js';
  import { t, type TranslationKey } from '$lib/i18n/t.js';
  import { typeIcon, typeLabel, relativeTime } from '$lib/utils/notification-helpers.js';
  import { getContentPathFromTags } from '$lib/nostr/content-link.js';
  import { npubEncode } from 'nostr-tools/nip19';
  import { untrack } from 'svelte';

  type NotificationFilter = 'all' | 'reply' | 'reaction' | 'mention' | 'follow_comment';

  const auth = getAuth();
  const notifs = getNotifications();

  let filter = $state<NotificationFilter>('all');
  let limit = $state(30);

  const PAGE_SIZE = 30;

  const filterOptions: { value: NotificationFilter; labelKey: TranslationKey }[] = [
    { value: 'all', labelKey: 'notification.filter.all' },
    { value: 'reply', labelKey: 'notification.filter.replies' },
    { value: 'reaction', labelKey: 'notification.filter.reactions' },
    { value: 'mention', labelKey: 'notification.filter.mentions' },
    { value: 'follow_comment', labelKey: 'notification.filter.follows' }
  ];

  let filteredItems = $derived(
    filter === 'all' ? notifs.items : notifs.items.filter((n) => n.type === filter)
  );

  let paginatedItems = $derived(filteredItems.slice(0, limit));
  let remaining = $derived(Math.max(0, filteredItems.length - limit));

  let lastReadTs = $state(notifs.lastReadTs);

  function isUnread(createdAt: number): boolean {
    return createdAt > lastReadTs;
  }

  // Fetch profiles for visible items
  $effect(() => {
    const pubkeys = [...new Set(paginatedItems.map((n) => n.pubkey))];
    untrack(() => fetchProfiles(pubkeys));
  });

  function contentPreview(content: string): string {
    return content.length > 80 ? content.slice(0, 78) + '\u2026' : content;
  }

  function handleMarkAllRead() {
    markAllAsRead();
    lastReadTs = Math.floor(Date.now() / 1000);
  }
</script>

<svelte:head>
  <title>{t('notification.title')} - Resonote</title>
</svelte:head>

{#if !auth.loggedIn}
  <div class="py-16 text-center">
    <p class="text-sm text-text-muted">{t('comment.login_prompt')}</p>
  </div>
{:else}
  <div class="mx-auto max-w-2xl">
    <div class="mb-6 flex items-center justify-between">
      <h1 class="text-lg font-semibold text-text-primary">{t('notification.title')}</h1>
      {#if notifs.items.length > 0}
        <button
          type="button"
          onclick={handleMarkAllRead}
          class="rounded-lg px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:bg-surface-1 hover:text-text-secondary"
        >
          {t('notification.mark_all_read')}
        </button>
      {/if}
    </div>

    <!-- Filter tabs -->
    <div class="mb-4 flex items-center gap-2 text-xs">
      <div class="flex items-center rounded-lg bg-surface-2 p-0.5">
        {#each filterOptions as opt (opt.value)}
          <button
            type="button"
            onclick={() => {
              filter = opt.value;
              limit = PAGE_SIZE;
            }}
            class="rounded-md px-2.5 py-1 font-medium transition-all
              {filter === opt.value
              ? 'bg-surface-0 text-text-primary shadow-sm'
              : 'text-text-muted hover:text-text-secondary'}"
          >
            {t(opt.labelKey)}
          </button>
        {/each}
      </div>
    </div>

    <!-- Notification list -->
    {#if paginatedItems.length === 0}
      <div class="py-16 text-center">
        <p class="text-sm text-text-muted">{t('notification.empty')}</p>
      </div>
    {:else}
      <div class="space-y-2">
        {#each paginatedItems as notif (notif.id)}
          {@const path = getContentPathFromTags(notif.tags)}
          {@const picture = getProfile(notif.pubkey)?.picture}
          {@const unread = isUnread(notif.createdAt)}
          <div
            class="flex items-start gap-3 rounded-xl border p-4 transition-all
              {unread
              ? 'border-accent/30 bg-accent/5'
              : 'border-border-subtle bg-surface-1 hover:border-border'}"
          >
            {#if unread}
              <span class="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent"></span>
            {/if}
            <span class="mt-0.5 text-base">{typeIcon(notif.type)}</span>
            {#if picture}
              <a href="/profile/{npubEncode(notif.pubkey)}" class="shrink-0">
                <img
                  src={picture}
                  alt=""
                  class="h-8 w-8 rounded-full object-cover ring-1 ring-border"
                />
              </a>
            {:else}
              <div
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-3 text-xs text-text-muted"
              >
                ?
              </div>
            {/if}
            <div class="min-w-0 flex-1">
              <p class="text-sm text-text-primary">
                <a
                  href="/profile/{npubEncode(notif.pubkey)}"
                  class="font-medium text-accent hover:underline">{getDisplayName(notif.pubkey)}</a
                >
                <span class="text-text-secondary">{typeLabel(notif.type)}</span>
              </p>
              {#if notif.content}
                <p class="mt-1 text-xs text-text-muted">{contentPreview(notif.content)}</p>
              {/if}
              {#if path}
                <a
                  href={path}
                  class="mt-1 inline-block text-xs text-accent hover:text-accent-hover hover:underline"
                  >{t('nip19.view_content')}</a
                >
              {/if}
            </div>
            <span class="shrink-0 text-xs text-text-muted">{relativeTime(notif.createdAt)}</span>
          </div>
        {/each}
      </div>

      {#if remaining > 0}
        <button
          type="button"
          onclick={() => (limit += PAGE_SIZE)}
          class="mt-4 w-full rounded-lg bg-surface-2 py-2 text-xs font-medium text-text-muted transition-colors hover:bg-surface-3 hover:text-text-secondary"
        >
          {t('profile.load_more')}
        </button>
      {/if}
    {/if}
  </div>
{/if}
