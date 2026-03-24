<script lang="ts">
  import { createProfileHeaderViewModel } from '$features/profiles/ui/profile-header-view-model.svelte.js';
  import UserAvatar from '$lib/components/UserAvatar.svelte';
  import { t } from '$shared/i18n/t.js';

  interface Props {
    pubkey: string;
    followsCount: number | null;
    followsPubkeys: string[];
    followActing: boolean;
    onFollow: () => void;
    onUnfollow: () => void;
    onMute: (pubkey: string) => void;
  }

  let { pubkey, followsCount, followsPubkeys, followActing, onFollow, onUnfollow, onMute }: Props =
    $props();
  const vm = createProfileHeaderViewModel({
    getPubkey: () => pubkey,
    getFollowsCount: () => followsCount,
    getFollowsPubkeys: () => followsPubkeys
  });
</script>

<div class="rounded-xl border border-border-subtle bg-surface-1 p-6">
  <div class="flex items-start gap-4">
    <UserAvatar pubkey={vm.pubkey} picture={vm.profileDisplay.picture} size="xl" />
    <div class="min-w-0 flex-1">
      <h1 class="font-display text-xl font-semibold text-text-primary">{vm.displayName}</h1>
      {#if vm.profileDisplay.formattedNip05}
        <p class="mt-0.5 text-sm text-text-muted">
          <span class="text-accent">&#10003;</span>
          {vm.formattedNip05}
        </p>
      {/if}
      {#if vm.profile?.about}
        <p class="mt-2 text-sm leading-relaxed text-text-secondary whitespace-pre-wrap break-words">
          {vm.profile.about}
        </p>
      {/if}
    </div>
  </div>

  <div class="mt-4 flex items-center gap-6">
    {#if vm.followsCount !== null}
      <button
        type="button"
        onclick={vm.toggleFollowsList}
        class="text-sm transition-opacity hover:opacity-80"
        disabled={vm.followsCount === 0}
      >
        <span class="font-semibold text-text-primary">{vm.followsCount}</span>
        <span class="text-text-muted">{t('profile.follows_count')}</span>
      </button>
    {/if}
  </div>

  {#if vm.showFollowsList && vm.followsPubkeys.length > 0}
    <div
      class="mt-3 max-h-64 space-y-1 overflow-y-auto rounded-xl border border-border-subtle bg-surface-0 p-3"
    >
      {#each vm.followsPubkeys as pk (pk)}
        {@const follow = vm.getFollowDisplay(pk)}
        <a
          href={follow.profileHref}
          class="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-1"
        >
          <UserAvatar pubkey={pk} picture={follow.picture} size="sm" />
          <span class="truncate text-sm text-text-primary">{follow.displayName}</span>
        </a>
      {/each}
    </div>
  {/if}

  {#if vm.auth.loggedIn && !vm.isOwnProfile}
    <div class="mt-4 flex items-center gap-2">
      {#if followActing}
        <button
          type="button"
          disabled
          class="rounded-xl border border-border px-5 py-2 text-sm font-semibold text-text-muted"
        >
          {t('profile.following')}
        </button>
      {:else if vm.isFollowing}
        <button
          type="button"
          onclick={onUnfollow}
          class="rounded-xl border border-border px-5 py-2 text-sm font-semibold text-text-secondary transition-colors hover:border-red-400 hover:text-red-400"
        >
          {t('profile.unfollow')}
        </button>
      {:else}
        <button
          type="button"
          onclick={onFollow}
          class="rounded-xl bg-accent px-5 py-2 text-sm font-semibold text-surface-0 transition-colors hover:bg-accent-hover"
        >
          {t('profile.follow')}
        </button>
      {/if}
      {#if vm.muteAvailable}
        <button
          type="button"
          onclick={() => onMute(pubkey)}
          class="rounded-xl border border-border px-5 py-2 text-sm font-semibold text-text-secondary transition-colors hover:border-red-400 hover:text-red-400"
        >
          {t('mute.user')}
        </button>
      {/if}
    </div>
  {/if}
</div>
