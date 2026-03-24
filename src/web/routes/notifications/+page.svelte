<script lang="ts">
  import UserAvatar from '$lib/components/UserAvatar.svelte';
  import { getAuth } from '$shared/browser/auth.js';
  import {
    createNotificationFeedViewModel,
    describeNotificationItem,
    getNotifications,
    type NotificationFeedFilter,
    type NotificationItemDisplay
  } from '$shared/browser/notifications.js';
  import { t, type TranslationKey } from '$shared/i18n/t.js';

  const auth = getAuth();
  const notifs = getNotifications();
  const feed = createNotificationFeedViewModel(notifs);

  const filterOptions: { value: NotificationFeedFilter; labelKey: TranslationKey }[] = [
    { value: 'all', labelKey: 'notification.filter.all' },
    { value: 'reply', labelKey: 'notification.filter.replies' },
    { value: 'reaction', labelKey: 'notification.filter.reactions' },
    { value: 'mention', labelKey: 'notification.filter.mentions' },
    { value: 'follow_comment', labelKey: 'notification.filter.follows' }
  ];
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
          onclick={feed.markAllRead}
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
            onclick={() => feed.setFilter(opt.value)}
            class="rounded-md px-2.5 py-1 font-medium transition-all
              {feed.filter === opt.value
              ? 'bg-surface-0 text-text-primary shadow-sm'
              : 'text-text-muted hover:text-text-secondary'}"
          >
            {t(opt.labelKey)}
          </button>
        {/each}
      </div>
    </div>

    <!-- Notification list -->
    {#if feed.items.length === 0}
      <div class="py-16 text-center">
        <p class="text-sm text-text-muted">{t('notification.empty')}</p>
      </div>
    {:else}
      <div class="space-y-2">
        {#each feed.items as notif (notif.id)}
          {@const item: NotificationItemDisplay = describeNotificationItem(notif, {
            contentPreview: feed.contentPreview,
            targetTexts: feed.targetTexts,
            unread: feed.isUnread(notif.createdAt)
          })}
          <div
            class="flex items-start gap-3 rounded-xl border p-4 transition-all
              {item.unread
              ? 'border-accent/30 bg-accent/5'
              : 'border-border-subtle bg-surface-1 hover:border-border'}"
          >
            {#if item.unread}
              <span class="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent"></span>
            {/if}
            <span class="mt-0.5 text-base">{item.icon}</span>
            <a href={item.actor.profileHref} class="shrink-0">
              <UserAvatar pubkey={item.actor.pubkey} picture={item.actor.picture} size="lg" />
            </a>
            <div class="min-w-0 flex-1">
              <p class="text-sm text-text-primary">
                <a href={item.actor.profileHref} class="font-medium text-accent hover:underline"
                  >{item.actor.displayName}</a
                >
                <span class="text-text-secondary">{item.label}</span>
              </p>
              {#if item.reaction}
                <p class="mt-1 flex items-center gap-1 text-xs text-text-muted">
                  {#if item.reaction.type === 'heart'}
                    <span class="text-base">❤️</span>
                  {:else if item.reaction.type === 'emoji_image' && item.reaction.url}
                    <img
                      src={item.reaction.url}
                      alt={item.reaction.content}
                      class="inline h-5 w-5"
                      loading="lazy"
                    />
                  {:else}
                    <span>{item.reaction.content}</span>
                  {/if}
                </p>
              {:else if item.contentPreview}
                <p class="mt-1 text-xs text-text-muted">{item.contentPreview}</p>
              {/if}
              {#if item.targetPreview}
                <p class="mt-0.5 truncate text-xs text-text-muted/70 italic">
                  {t('notification.your_comment', { text: item.targetPreview })}
                </p>
              {/if}
              {#if item.contentPath}
                <a
                  href={item.contentPath}
                  class="mt-1 inline-block text-xs text-accent hover:text-accent-hover hover:underline"
                  >{t('nip19.view_content')}</a
                >
              {/if}
            </div>
            <span class="shrink-0 text-xs text-text-muted">{item.timeLabel}</span>
          </div>
        {/each}
      </div>

      {#if feed.remaining > 0}
        <button
          type="button"
          onclick={feed.loadMore}
          class="mt-4 w-full rounded-lg bg-surface-2 py-2 text-xs font-medium text-text-muted transition-colors hover:bg-surface-3 hover:text-text-secondary"
        >
          {t('profile.load_more')}
        </button>
      {/if}
    {/if}
  </div>
{/if}
