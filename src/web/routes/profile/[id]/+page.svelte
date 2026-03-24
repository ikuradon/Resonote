<script lang="ts">
  import { page } from '$app/state';
  import { createProfilePageViewModel } from '$features/profiles/ui/profile-page-view-model.svelte.js';
  import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
  import { t } from '$shared/i18n/t.js';

  import ProfileComments from './ProfileComments.svelte';
  import ProfileHeader from './ProfileHeader.svelte';

  const vm = createProfilePageViewModel(() => page.params.id ?? '');
</script>

<svelte:head>
  <title>{vm.displayName || 'Profile'} - Resonote</title>
</svelte:head>

{#if vm.error}
  <div class="flex flex-col items-center gap-6 pt-20">
    <p class="font-display text-lg text-text-secondary">{t('profile.no_profile')}</p>
    <a href="/" class="text-sm text-accent transition-colors hover:text-accent-hover">
      {t('content.back_home')}
    </a>
  </div>
{:else if vm.pubkey}
  <div class="mx-auto max-w-3xl space-y-6">
    <ProfileHeader
      pubkey={vm.pubkey}
      followsCount={vm.followsCount}
      followsPubkeys={vm.followsPubkeys}
      followActing={vm.followActing}
      onFollow={vm.requestFollow}
      onUnfollow={vm.requestUnfollow}
      onMute={vm.requestMuteUser}
    />

    <ProfileComments
      comments={vm.comments}
      loading={vm.commentsLoading}
      hasMore={vm.hasMore}
      onLoadMore={vm.loadMore}
    />
  </div>

  <ConfirmDialog {...vm.confirmDialog} />
{/if}
