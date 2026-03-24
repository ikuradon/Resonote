<script lang="ts">
  import { isNodeInsideElements, manageClickOutside } from '$shared/browser/click-outside.js';
  import { createMediaQuery } from '$shared/browser/media-query.js';
  import {
    createNotificationFeedViewModel,
    describeNotificationItem,
    getNotifications,
    type NotificationItemDisplay
  } from '$shared/browser/notifications.js';
  import { t } from '$shared/i18n/t.js';

  import MobileOverlay from './MobileOverlay.svelte';

  const notifs = getNotifications();

  let open = $state(false);
  const feed = createNotificationFeedViewModel(notifs, {
    pageSize: 5,
    contentPreviewLength: 50,
    active: () => open
  });
  const desktop = createMediaQuery('(min-width: 1024px)');

  let isDesktop = $derived(desktop.matches);
  let containerEl: HTMLDivElement | undefined;

  manageClickOutside({
    active: () => open && isDesktop,
    isInside: (target) => isNodeInsideElements(target, [containerEl]),
    onOutside: () => {
      open = false;
    }
  });

  $effect(() => {
    if (open) {
      feed.markAllRead();
    }
  });
</script>

<div class="relative" bind:this={containerEl}>
  <button
    onclick={() => (open = !open)}
    class="relative flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-1 hover:text-text-secondary"
    title={t('notification.title')}
    aria-expanded={open}
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

  {#snippet notificationList()}
    {#if feed.items.length === 0}
      <div class="px-4 py-8 text-center text-sm text-text-muted">
        {t('notification.empty')}
      </div>
    {:else}
      <div class="max-h-80 overflow-y-auto lg:max-h-80">
        {#each feed.items as notif (notif.id)}
          {@const item: NotificationItemDisplay = describeNotificationItem(notif, {
            contentPreview: feed.contentPreview,
            targetTexts: feed.targetTexts
          })}
          {#if item.contentPath}
            <a
              href={item.contentPath}
              onclick={() => (open = false)}
              class="flex gap-3 px-4 py-3 transition-colors hover:bg-surface-2"
            >
              <span class="mt-0.5 text-sm">{item.icon}</span>
              <div class="min-w-0 flex-1">
                <p class="text-xs text-text-primary">
                  <span class="font-medium text-accent">{item.actor.displayName}</span>
                  {item.label}
                </p>
                {#if item.reaction}
                  <p class="mt-0.5 flex items-center gap-1 text-xs text-text-muted">
                    {#if item.reaction.type === 'heart'}
                      <span>❤️</span>
                    {:else if item.reaction.type === 'emoji_image' && item.reaction.url}
                      <img
                        src={item.reaction.url}
                        alt={item.reaction.content}
                        class="inline h-4 w-4"
                        loading="lazy"
                      />
                    {:else}
                      <span>{item.reaction.content}</span>
                    {/if}
                  </p>
                {:else if item.contentPreview}
                  <p class="mt-0.5 truncate text-xs text-text-muted">
                    {item.contentPreview}
                  </p>
                {/if}
                {#if item.targetPreview}
                  <p class="mt-0.5 truncate text-xs text-text-muted/70 italic">
                    {t('notification.your_comment', { text: item.targetPreview })}
                  </p>
                {/if}
              </div>
              <span class="shrink-0 text-[10px] text-text-muted">{item.timeLabel}</span>
            </a>
          {:else}
            <div class="flex gap-3 px-4 py-3">
              <span class="mt-0.5 text-sm">{item.icon}</span>
              <div class="min-w-0 flex-1">
                <p class="text-xs text-text-primary">
                  <span class="font-medium text-accent">{item.actor.displayName}</span>
                  {item.label}
                </p>
                {#if item.reaction}
                  <p class="mt-0.5 flex items-center gap-1 text-xs text-text-muted">
                    {#if item.reaction.type === 'heart'}
                      <span>❤️</span>
                    {:else if item.reaction.type === 'emoji_image' && item.reaction.url}
                      <img
                        src={item.reaction.url}
                        alt={item.reaction.content}
                        class="inline h-4 w-4"
                        loading="lazy"
                      />
                    {:else}
                      <span>{item.reaction.content}</span>
                    {/if}
                  </p>
                {:else if item.contentPreview}
                  <p class="mt-0.5 truncate text-xs text-text-muted">
                    {item.contentPreview}
                  </p>
                {/if}
                {#if item.targetPreview}
                  <p class="mt-0.5 truncate text-xs text-text-muted/70 italic">
                    {t('notification.your_comment', { text: item.targetPreview })}
                  </p>
                {/if}
              </div>
              <span class="shrink-0 text-[10px] text-text-muted">{item.timeLabel}</span>
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
  {/snippet}

  {#if open && isDesktop}
    <div
      class="absolute top-full right-0 z-50 mt-2 w-80 rounded-xl border border-border bg-surface-1 shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
    >
      <div class="border-b border-border-subtle px-4 py-3">
        <span class="text-sm font-medium text-text-secondary">{t('notification.title')}</span>
      </div>

      {@render notificationList()}
    </div>
  {/if}

  {#if !isDesktop}
    <MobileOverlay
      {open}
      onclose={() => {
        open = false;
      }}
      title={t('notification.title')}
    >
      {@render notificationList()}
    </MobileOverlay>
  {/if}
</div>
