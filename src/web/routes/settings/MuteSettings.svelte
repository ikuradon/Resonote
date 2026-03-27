<script lang="ts">
  import { createMuteSettingsViewModel } from '$features/mute/ui/mute-settings-view-model.svelte.js';
  import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
  import { t } from '$shared/i18n/t.js';

  const vm = createMuteSettingsViewModel();
</script>

<section class="relative rounded-2xl border border-border bg-surface-1 p-6 space-y-5">
  <h2 class="font-display text-lg font-semibold text-text-primary">
    {t('mute.title')}
  </h2>

  {#if !vm.nip44Supported}
    <!-- Blur overlay for NIP-44 unsupported -->
    <div
      class="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-surface-1/60 backdrop-blur-sm"
    >
      <p class="rounded-xl bg-amber-500/10 px-6 py-4 text-sm font-medium text-amber-400">
        {t('mute.nip44_required')}
      </p>
    </div>
  {/if}

  <div class="space-y-2">
    <h3 class="text-sm font-medium text-text-secondary">{t('mute.users')}</h3>
    {#if vm.muteList.mutedPubkeys.size === 0}
      <p class="py-2 text-sm text-text-muted">{t('mute.empty_users')}</p>
    {:else}
      {#each vm.mutedUsers as user (user.pubkey)}
        <div
          class="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface-0 px-4 py-3"
        >
          <a href={user.profileHref} class="flex-1 truncate text-sm text-accent hover:underline">
            {user.displayName}
          </a>
          <button
            type="button"
            onclick={() => vm.requestUnmuteUser(user.pubkey)}
            disabled={!vm.nip44Supported}
            class="rounded-lg px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:bg-surface-2 hover:text-text-secondary disabled:opacity-30"
          >
            {t('mute.unmute')}
          </button>
        </div>
      {/each}
    {/if}
  </div>

  <div class="space-y-2">
    <h3 class="text-sm font-medium text-text-secondary">{t('mute.words')}</h3>
    {#if vm.muteList.mutedWords.length === 0}
      <p class="py-2 text-sm text-text-muted">{t('mute.empty_words')}</p>
    {:else}
      {#each vm.muteList.mutedWords as word (word)}
        <div
          class="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface-0 px-4 py-3"
        >
          <span class="flex-1 text-sm text-text-primary">{word}</span>
          <button
            type="button"
            onclick={() => vm.requestUnmuteWord(word)}
            disabled={!vm.nip44Supported}
            class="rounded-lg px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:bg-surface-2 hover:text-text-secondary disabled:opacity-30"
            aria-label={t('mute.unmute')}
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
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      {/each}
    {/if}

    <div class="flex gap-2">
      <input
        type="text"
        bind:value={vm.newMuteWord}
        onkeydown={vm.handleMuteWordKeydown}
        placeholder={t('mute.word_placeholder')}
        aria-label="Mute word"
        disabled={!vm.nip44Supported}
        class="flex-1 rounded-xl border border-border bg-surface-0 px-4 py-2.5 text-sm text-text-primary placeholder-text-muted outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent/40 disabled:opacity-30"
      />
      <button
        type="button"
        onclick={vm.requestAddMuteWord}
        disabled={!vm.nip44Supported}
        class="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-surface-0 transition-colors hover:bg-accent-hover disabled:opacity-30"
      >
        {t('mute.add_word')}
      </button>
    </div>
  </div>
</section>

<ConfirmDialog {...vm.confirmDialog} />
