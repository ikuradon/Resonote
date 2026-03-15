<script lang="ts">
  import { page } from '$app/state';
  import { decodeNip19 } from '$lib/nostr/nip19-decode.js';
  import { fetchProfile, getProfile, getDisplayName } from '$lib/stores/profile.svelte.js';
  import { formatNip05 } from '$lib/stores/profile-utils.js';
  import { getAuth } from '$lib/stores/auth.svelte.js';
  import { getFollows, followUser, unfollowUser } from '$lib/stores/follows.svelte.js';
  import { t } from '$lib/i18n/t.js';
  import { iTagToContentPath } from '$lib/nostr/content-link.js';
  import { npubEncode } from 'nostr-tools/nip19';
  import { createLogger } from '$lib/utils/logger.js';

  const log = createLogger('ProfilePage');

  const auth = getAuth();
  const follows = getFollows();

  let pubkey = $state<string | null>(null);
  let error = $state(false);
  let followsCount = $state<number | null>(null);
  let followsPubkeys = $state<string[]>([]);
  let showFollowsList = $state(false);
  let comments = $state<{ id: string; content: string; createdAt: number; iTag: string | null }[]>(
    []
  );
  let commentsLoading = $state(false);
  let commentsUntil = $state<number | null>(null);
  let hasMore = $state(false);
  let followActing = $state(false);

  const COMMENTS_LIMIT = 50;

  // Decode the id param
  $effect(() => {
    const id = page.params.id ?? '';
    const decoded = decodeNip19(id);

    if (decoded && (decoded.type === 'npub' || decoded.type === 'nprofile')) {
      pubkey = decoded.pubkey;
      error = false;
    } else {
      pubkey = null;
      error = true;
    }
  });

  // Fetch profile when pubkey changes
  $effect(() => {
    if (!pubkey) return;
    fetchProfile(pubkey);
  });

  // Fetch follow count (kind:3)
  $effect(() => {
    if (!pubkey) return;
    followsCount = null;
    followsPubkeys = [];
    showFollowsList = false;
    fetchFollowsCount(pubkey);
  });

  // Fetch comments (kind:1111)
  $effect(() => {
    if (!pubkey) return;
    comments = [];
    commentsUntil = null;
    hasMore = false;
    loadComments(pubkey);
  });

  async function fetchFollowsCount(pk: string) {
    try {
      const [{ createRxBackwardReq }, { getRxNostr }] = await Promise.all([
        import('rx-nostr'),
        import('$lib/nostr/client.js')
      ]);
      const rxNostr = await getRxNostr();
      const req = createRxBackwardReq();

      let latestEvent: { tags: string[][] } | null = null;

      const sub = rxNostr.use(req).subscribe({
        next: (packet) => {
          latestEvent = packet.event;
        },
        complete: () => {
          sub.unsubscribe();
          if (latestEvent) {
            const pks = latestEvent.tags
              .filter((tag) => tag[0] === 'p' && tag[1])
              .map((tag) => tag[1]);
            followsCount = pks.length;
            followsPubkeys = pks;
          } else {
            followsCount = 0;
            followsPubkeys = [];
          }
        },
        error: () => {
          sub.unsubscribe();
          followsCount = 0;
        }
      });

      req.emit({ kinds: [3], authors: [pk], limit: 1 });
      req.over();
    } catch (err) {
      log.error('Failed to fetch follows count', err);
      followsCount = 0;
    }
  }

  async function loadComments(pk: string, until?: number) {
    commentsLoading = true;
    try {
      const [{ createRxBackwardReq }, { getRxNostr }] = await Promise.all([
        import('rx-nostr'),
        import('$lib/nostr/client.js')
      ]);
      const rxNostr = await getRxNostr();
      const req = createRxBackwardReq();

      const newComments: typeof comments = [];

      const sub = rxNostr.use(req).subscribe({
        next: (packet) => {
          const iTag = packet.event.tags.find((tag) => tag[0] === 'I')?.[1] ?? null;
          newComments.push({
            id: packet.event.id,
            content: packet.event.content,
            createdAt: packet.event.created_at,
            iTag
          });
        },
        complete: () => {
          sub.unsubscribe();
          newComments.sort((a, b) => b.createdAt - a.createdAt);
          if (until) {
            comments = [...comments, ...newComments];
          } else {
            comments = newComments;
          }
          hasMore = newComments.length >= COMMENTS_LIMIT;
          if (newComments.length > 0) {
            commentsUntil = newComments[newComments.length - 1].createdAt;
          }
          commentsLoading = false;
        },
        error: () => {
          sub.unsubscribe();
          commentsLoading = false;
        }
      });

      req.emit(
        until
          ? { kinds: [1111], authors: [pk], limit: COMMENTS_LIMIT, until }
          : { kinds: [1111], authors: [pk], limit: COMMENTS_LIMIT }
      );
      req.over();
    } catch (err) {
      log.error('Failed to load comments', err);
      commentsLoading = false;
    }
  }

  function loadMore() {
    if (!pubkey || !commentsUntil || commentsLoading) return;
    loadComments(pubkey, commentsUntil);
  }

  async function handleFollow() {
    if (!pubkey || followActing) return;
    followActing = true;
    try {
      await followUser(pubkey);
    } catch (err) {
      log.error('Failed to follow', err);
    } finally {
      followActing = false;
    }
  }

  async function handleUnfollow() {
    if (!pubkey || followActing) return;
    followActing = true;
    try {
      await unfollowUser(pubkey);
    } catch (err) {
      log.error('Failed to unfollow', err);
    } finally {
      followActing = false;
    }
  }

  let profile = $derived(pubkey ? getProfile(pubkey) : undefined);
  let displayName = $derived(pubkey ? getDisplayName(pubkey) : '');
  let isOwnProfile = $derived(auth.pubkey !== null && pubkey === auth.pubkey);
  let isFollowing = $derived(pubkey ? follows.follows.has(pubkey) : false);

  function formatTime(timestamp: number): string {
    return new Date(timestamp * 1000).toLocaleString();
  }

  function contentLink(iTag: string): string | null {
    return iTagToContentPath(iTag);
  }
</script>

{#if error}
  <div class="flex flex-col items-center gap-6 pt-20">
    <p class="font-display text-lg text-text-secondary">{t('profile.no_profile')}</p>
    <a href="/" class="text-sm text-accent transition-colors hover:text-accent-hover">
      {t('content.back_home')}
    </a>
  </div>
{:else if pubkey}
  <div class="mx-auto max-w-3xl space-y-6">
    <!-- Header section -->
    <div class="rounded-xl border border-border-subtle bg-surface-1 p-6">
      <div class="flex items-start gap-4">
        {#if profile?.picture}
          <img
            src={profile.picture}
            alt=""
            class="h-16 w-16 rounded-full object-cover ring-2 ring-border"
          />
        {:else}
          <div
            class="flex h-16 w-16 items-center justify-center rounded-full bg-surface-3 text-xl text-text-muted"
          >
            ?
          </div>
        {/if}
        <div class="min-w-0 flex-1">
          <h1 class="font-display text-xl font-semibold text-text-primary">{displayName}</h1>
          {#if profile?.nip05valid === true && profile.nip05}
            <p class="mt-0.5 text-sm text-text-muted">
              <span class="text-accent">&#10003;</span>
              {formatNip05(profile.nip05)}
            </p>
          {/if}
          {#if profile?.about}
            <p
              class="mt-2 text-sm leading-relaxed text-text-secondary whitespace-pre-wrap break-words"
            >
              {profile.about}
            </p>
          {/if}
        </div>
      </div>

      <!-- Stats row -->
      <div class="mt-4 flex items-center gap-6">
        {#if followsCount !== null}
          <button
            type="button"
            onclick={() => {
              if (followsPubkeys.length > 0) {
                showFollowsList = !showFollowsList;
                if (showFollowsList) {
                  import('$lib/stores/profile.svelte.js').then(({ fetchProfiles }) =>
                    fetchProfiles(followsPubkeys.slice(0, 50))
                  );
                }
              }
            }}
            class="text-sm transition-opacity hover:opacity-80"
            disabled={followsCount === 0}
          >
            <span class="font-semibold text-text-primary">{followsCount}</span>
            <span class="text-text-muted">{t('profile.follows_count')}</span>
          </button>
        {/if}
      </div>

      <!-- Follows list (expandable) -->
      {#if showFollowsList && followsPubkeys.length > 0}
        <div
          class="mt-3 max-h-64 space-y-1 overflow-y-auto rounded-xl border border-border-subtle bg-surface-0 p-3"
        >
          {#each followsPubkeys as pk (pk)}
            {@const prof = getProfile(pk)}
            <a
              href="/profile/{npubEncode(pk)}"
              class="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-1"
            >
              {#if prof?.picture}
                <img
                  src={prof.picture}
                  alt=""
                  class="h-6 w-6 rounded-full object-cover ring-1 ring-border"
                />
              {:else}
                <div
                  class="flex h-6 w-6 items-center justify-center rounded-full bg-surface-3 text-xs text-text-muted"
                >
                  ?
                </div>
              {/if}
              <span class="truncate text-sm text-text-primary">{getDisplayName(pk)}</span>
            </a>
          {/each}
        </div>
      {/if}

      <!-- Follow/Unfollow button -->
      {#if auth.loggedIn && !isOwnProfile}
        <div class="mt-4">
          {#if followActing}
            <button
              type="button"
              disabled
              class="rounded-xl border border-border px-5 py-2 text-sm font-semibold text-text-muted"
            >
              {t('profile.following')}
            </button>
          {:else if isFollowing}
            <button
              type="button"
              onclick={handleUnfollow}
              class="rounded-xl border border-border px-5 py-2 text-sm font-semibold text-text-secondary transition-colors hover:border-red-400 hover:text-red-400"
            >
              {t('profile.unfollow')}
            </button>
          {:else}
            <button
              type="button"
              onclick={handleFollow}
              class="rounded-xl bg-accent px-5 py-2 text-sm font-semibold text-surface-0 transition-colors hover:bg-accent-hover"
            >
              {t('profile.follow')}
            </button>
          {/if}
        </div>
      {/if}
    </div>

    <!-- Comments section -->
    <div class="space-y-4">
      <div class="flex items-center gap-3">
        <h2 class="font-display text-lg font-semibold text-text-primary">
          {t('profile.comments')}
        </h2>
        <div class="h-px flex-1 bg-border-subtle"></div>
      </div>

      {#if comments.length === 0 && !commentsLoading}
        <p class="py-8 text-center text-sm text-text-muted">
          {t('profile.no_comments')}
        </p>
      {:else}
        <div class="space-y-3">
          {#each comments as comment (comment.id)}
            <div
              class="rounded-xl border border-border-subtle bg-surface-1 p-4 transition-all hover:border-border"
            >
              <p class="text-sm leading-relaxed text-text-primary whitespace-pre-wrap break-words">
                {comment.content}
              </p>
              <div class="mt-2 flex items-center justify-between">
                <span class="text-xs text-text-muted">{formatTime(comment.createdAt)}</span>
                {#if comment.iTag}
                  {@const link = contentLink(comment.iTag)}
                  {#if link}
                    <a
                      href={link}
                      class="text-xs text-accent transition-colors hover:text-accent-hover hover:underline"
                    >
                      {comment.iTag}
                    </a>
                  {/if}
                {/if}
              </div>
            </div>
          {/each}
        </div>

        {#if hasMore}
          <button
            type="button"
            disabled={commentsLoading}
            onclick={loadMore}
            class="w-full rounded-lg bg-surface-2 py-2.5 text-sm font-medium text-text-muted transition-colors hover:bg-surface-3 hover:text-text-secondary disabled:opacity-50"
          >
            {#if commentsLoading}
              {t('loading')}
            {:else}
              {t('profile.load_more')}
            {/if}
          </button>
        {/if}
      {/if}

      {#if commentsLoading && comments.length === 0}
        <p class="py-8 text-center text-sm text-text-muted">
          {t('loading')}
        </p>
      {/if}
    </div>
  </div>
{/if}
