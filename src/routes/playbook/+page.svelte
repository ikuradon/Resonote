<script lang="ts">
  import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
  import SendButton from '$lib/components/SendButton.svelte';

  // --- Toggle states ---
  let sendingOther = $state(false);
  let liked = $state(false);
  let confirmOpen = $state(false);
  let spotifyReady = $state(false);
  let youtubeReady = $state(false);

  // Send button fly animation states (one set per independent demo)
  let btnFlying = $state(false);
  let btnSending = $state(false);
  let formFlying = $state(false);
  let formSending = $state(false);
  let busyForm = $derived(formSending || formFlying);

  function simulateSend() {
    sendingOther = true;
    setTimeout(() => (sendingOther = false), 2000);
  }

  function createFlySimulator(setFlying: (v: boolean) => void, setSending: (v: boolean) => void) {
    return () => {
      setFlying(true);
      setTimeout(() => {
        setSending(true);
        setFlying(false);
        setTimeout(() => setSending(false), 1500);
      }, 400);
    };
  }

  const simulateFly = createFlySimulator(
    (v) => (btnFlying = v),
    (v) => (btnSending = v)
  );
  const simulateFlyForm = createFlySimulator(
    (v) => (formFlying = v),
    (v) => (formSending = v)
  );
</script>

<div class="mx-auto max-w-4xl space-y-12">
  <div>
    <h1 class="font-display text-2xl font-bold text-text-primary">Component Playbook</h1>
    <p class="mt-1 text-sm text-text-muted">各コンポーネントの状態を切り替えて動作確認できます</p>
  </div>

  <!-- ========== Section: Action Buttons ========== -->
  <section class="space-y-4">
    <h2 class="font-display text-lg font-semibold text-text-primary">Action Buttons</h2>
    <div class="h-px bg-border-subtle"></div>

    <!-- Send Button -->
    <div class="rounded-xl border border-border-subtle bg-surface-1 p-5">
      <h3 class="mb-3 text-xs font-semibold tracking-wide text-text-secondary uppercase">
        Send Button
      </h3>
      <div class="flex flex-wrap items-center gap-4">
        <SendButton type="button" sending={btnSending} flying={btnFlying} onclick={simulateFly} />
        <button
          type="button"
          disabled
          class="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-surface-0 transition-all duration-200 hover:bg-accent-hover disabled:opacity-30"
        >
          <svg
            class="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
          Send
        </button>
        <span class="text-xs text-text-muted">← disabled</span>
      </div>
      <p class="mt-2 text-xs text-text-muted">
        クリック → 紙飛行機射出 + disable → ローディングへフェード → 完了で復帰
      </p>
    </div>

    <!-- Reply Button -->
    <div class="rounded-xl border border-border-subtle bg-surface-1 p-5">
      <h3 class="mb-3 text-xs font-semibold tracking-wide text-text-secondary uppercase">
        Reply Submit Button
      </h3>
      <div class="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onclick={simulateSend}
          disabled={sendingOther}
          class="inline-flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-surface-0 transition-all duration-200 hover:bg-accent-hover disabled:opacity-30"
        >
          {#if sendingOther}
            <svg
              class="h-3.5 w-3.5 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            Sending
          {:else}
            Reply
          {/if}
        </button>
        <button
          type="button"
          disabled={sendingOther}
          class="rounded-lg px-3 py-1.5 text-xs text-text-muted transition-colors hover:text-text-secondary disabled:opacity-30"
        >
          Cancel
        </button>
      </div>
    </div>

    <!-- Share Button -->
    <div class="rounded-xl border border-border-subtle bg-surface-1 p-5">
      <h3 class="mb-3 text-xs font-semibold tracking-wide text-text-secondary uppercase">
        Share / Post Button
      </h3>
      <div class="flex flex-wrap items-center gap-4">
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium text-text-secondary transition-all duration-200 hover:bg-surface-3 hover:text-text-primary"
        >
          <svg
            class="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
            <polyline points="16 6 12 2 8 6" />
            <line x1="12" y1="2" x2="12" y2="15" />
          </svg>
          Share
        </button>
        <button
          type="button"
          onclick={simulateSend}
          disabled={sendingOther}
          class="inline-flex items-center gap-1 rounded-lg bg-accent px-4 py-1.5 text-xs font-semibold text-surface-0 transition-all duration-200 hover:bg-accent-hover disabled:opacity-30"
        >
          {#if sendingOther}
            <svg
              class="h-3.5 w-3.5 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            Sending
          {:else}
            Post
          {/if}
        </button>
      </div>
    </div>

    <!-- Logout Button -->
    <div class="rounded-xl border border-border-subtle bg-surface-1 p-5">
      <h3 class="mb-3 text-xs font-semibold tracking-wide text-text-secondary uppercase">
        Logout Button
      </h3>
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-text-secondary transition-all duration-200 hover:bg-surface-3 hover:text-text-primary"
      >
        <svg
          class="h-3.5 w-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
        Logout
      </button>
    </div>
  </section>

  <!-- ========== Section: Comment Action Icons ========== -->
  <section class="space-y-4">
    <h2 class="font-display text-lg font-semibold text-text-primary">Comment Action Icons</h2>
    <div class="h-px bg-border-subtle"></div>

    <div class="rounded-xl border border-border-subtle bg-surface-1 p-5">
      <h3 class="mb-3 text-xs font-semibold tracking-wide text-text-secondary uppercase">
        Interactive States
      </h3>
      <div class="flex items-center gap-1">
        <!-- Like -->
        <button
          type="button"
          onclick={() => (liked = !liked)}
          class="inline-flex items-center gap-1 rounded-lg p-1.5 transition-colors
            {liked ? 'text-accent' : 'text-text-muted hover:text-accent'}"
          title={liked ? 'Liked' : 'Like'}
        >
          <svg
            class="h-4 w-4"
            viewBox="0 0 24 24"
            fill={liked ? 'currentColor' : 'none'}
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
            />
          </svg>
          <span class="text-xs font-mono">3</span>
        </button>

        <!-- Emoji -->
        <button
          type="button"
          class="rounded-lg p-1.5 text-text-muted transition-colors hover:text-text-secondary"
          title="Emoji"
        >
          <svg
            class="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M8 14s1.5 2 4 2 4-2 4-2" />
            <line x1="9" y1="9" x2="9.01" y2="9" />
            <line x1="15" y1="9" x2="15.01" y2="9" />
          </svg>
        </button>

        <!-- Reply -->
        <button
          type="button"
          class="rounded-lg p-1.5 text-text-muted transition-colors hover:text-accent"
          title="Reply"
        >
          <svg
            class="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <polyline points="9 17 4 12 9 7" />
            <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
          </svg>
        </button>

        <!-- Delete -->
        <button
          type="button"
          onclick={() => (confirmOpen = true)}
          class="ml-auto rounded-lg p-1.5 text-text-muted transition-colors hover:text-red-400"
          title="Delete"
        >
          <svg
            class="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <polyline points="3 6 5 6 21 6" />
            <path
              d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
            />
          </svg>
        </button>
      </div>
      <p class="mt-3 text-xs text-text-muted">
        ハートをクリックでlike切替、ゴミ箱で削除確認ダイアログを表示
      </p>
    </div>

    <!-- All icons reference -->
    <div class="rounded-xl border border-border-subtle bg-surface-1 p-5">
      <h3 class="mb-3 text-xs font-semibold tracking-wide text-text-secondary uppercase">
        Icon Reference
      </h3>
      <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {#each [{ name: 'Like', icon: 'heart' }, { name: 'Emoji', icon: 'smile' }, { name: 'Reply', icon: 'reply' }, { name: 'Delete', icon: 'trash' }, { name: 'Send', icon: 'send' }, { name: 'Share', icon: 'share' }, { name: 'Logout', icon: 'logout' }, { name: 'Close', icon: 'close' }] as item (item.name)}
          <div class="flex items-center gap-3 rounded-lg bg-surface-2 p-3">
            <div class="rounded-lg bg-surface-3 p-2 text-text-secondary">
              {#if item.icon === 'heart'}
                <svg
                  class="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path
                    d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
                  />
                </svg>
              {:else if item.icon === 'smile'}
                <svg
                  class="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                  <line x1="9" y1="9" x2="9.01" y2="9" />
                  <line x1="15" y1="9" x2="15.01" y2="9" />
                </svg>
              {:else if item.icon === 'reply'}
                <svg
                  class="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <polyline points="9 17 4 12 9 7" />
                  <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
                </svg>
              {:else if item.icon === 'trash'}
                <svg
                  class="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <polyline points="3 6 5 6 21 6" />
                  <path
                    d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                  />
                </svg>
              {:else if item.icon === 'send'}
                <svg
                  class="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              {:else if item.icon === 'share'}
                <svg
                  class="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                  <polyline points="16 6 12 2 8 6" />
                  <line x1="12" y1="2" x2="12" y2="15" />
                </svg>
              {:else if item.icon === 'logout'}
                <svg
                  class="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              {:else if item.icon === 'close'}
                <svg
                  class="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              {/if}
            </div>
            <span class="text-xs font-medium text-text-secondary">{item.name}</span>
          </div>
        {/each}
      </div>
    </div>
  </section>

  <!-- ========== Section: Loading Overlays ========== -->
  <section class="space-y-4">
    <h2 class="font-display text-lg font-semibold text-text-primary">Embed Loading Overlays</h2>
    <div class="h-px bg-border-subtle"></div>

    <!-- Spotify Loading -->
    <div class="rounded-xl border border-border-subtle bg-surface-1 p-5">
      <div class="mb-3 flex items-center justify-between">
        <h3 class="text-xs font-semibold tracking-wide text-text-secondary uppercase">
          Spotify Embed
        </h3>
        <button
          type="button"
          onclick={() => (spotifyReady = !spotifyReady)}
          class="rounded-lg bg-surface-2 px-3 py-1 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-3"
        >
          {spotifyReady ? 'Show Loading' : 'Show Ready'}
        </button>
      </div>
      <div
        class="relative w-full overflow-hidden rounded-2xl border border-border-subtle shadow-[0_4px_24px_rgba(0,0,0,0.4)]"
      >
        <div class="h-[352px] bg-surface-0"></div>
        {#if !spotifyReady}
          <div
            class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-surface-1"
          >
            <div class="flex items-center gap-3">
              <svg class="h-8 w-8 text-spotify" viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"
                />
              </svg>
              <span class="text-sm font-medium text-text-muted">Loading...</span>
            </div>
            <div class="w-48">
              <div class="h-1 overflow-hidden rounded-full bg-surface-3">
                <div
                  class="animate-shimmer h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-spotify/40 to-transparent"
                  style="background-size: 400px 100%;"
                ></div>
              </div>
            </div>
          </div>
        {/if}
      </div>
    </div>

    <!-- YouTube Loading -->
    <div class="rounded-xl border border-border-subtle bg-surface-1 p-5">
      <div class="mb-3 flex items-center justify-between">
        <h3 class="text-xs font-semibold tracking-wide text-text-secondary uppercase">
          YouTube Embed
        </h3>
        <button
          type="button"
          onclick={() => (youtubeReady = !youtubeReady)}
          class="rounded-lg bg-surface-2 px-3 py-1 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-3"
        >
          {youtubeReady ? 'Show Loading' : 'Show Ready'}
        </button>
      </div>
      <div
        class="relative aspect-video w-full overflow-hidden rounded-2xl border border-border-subtle shadow-[0_4px_24px_rgba(0,0,0,0.4)]"
      >
        <div class="h-full bg-surface-0"></div>
        {#if !youtubeReady}
          <div
            class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-surface-1"
          >
            <div class="flex items-center gap-3">
              <svg class="h-8 w-8 text-youtube" viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"
                />
              </svg>
              <span class="text-sm font-medium text-text-muted">Loading...</span>
            </div>
            <div class="w-48">
              <div class="h-1 overflow-hidden rounded-full bg-surface-3">
                <div
                  class="animate-shimmer h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-youtube/40 to-transparent"
                  style="background-size: 400px 100%;"
                ></div>
              </div>
            </div>
          </div>
        {/if}
      </div>
    </div>
  </section>

  <!-- ========== Section: Confirm Dialog ========== -->
  <section class="space-y-4">
    <h2 class="font-display text-lg font-semibold text-text-primary">Confirm Dialog</h2>
    <div class="h-px bg-border-subtle"></div>

    <div class="rounded-xl border border-border-subtle bg-surface-1 p-5">
      <h3 class="mb-3 text-xs font-semibold tracking-wide text-text-secondary uppercase">
        Delete Confirmation
      </h3>
      <button
        type="button"
        onclick={() => (confirmOpen = true)}
        class="rounded-lg bg-error px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:brightness-110"
      >
        Open Dialog
      </button>
      <p class="mt-2 text-xs text-text-muted">Escapeキーまたはバックドロップクリックでも閉じます</p>
    </div>
  </section>

  <!-- ========== Section: Form States ========== -->
  <section class="space-y-4">
    <h2 class="font-display text-lg font-semibold text-text-primary">Form States</h2>
    <div class="h-px bg-border-subtle"></div>

    <div class="rounded-xl border border-border-subtle bg-surface-1 p-5">
      <h3 class="mb-3 text-xs font-semibold tracking-wide text-text-secondary uppercase">
        Comment Form (Sending State)
      </h3>
      <div class="space-y-2">
        <div class="flex items-center gap-2 text-xs">
          <button
            type="button"
            disabled={busyForm}
            class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium transition-all duration-200
              {!busyForm
              ? 'bg-accent/15 text-accent ring-1 ring-accent/30'
              : 'cursor-not-allowed bg-surface-3 text-text-muted/40'}"
          >
            <span class="font-mono">1:23</span>
            <span>時間コメント</span>
          </button>
          <button
            type="button"
            disabled={busyForm}
            class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium transition-all duration-200 bg-surface-3 text-text-muted hover:text-text-secondary disabled:cursor-not-allowed disabled:opacity-40"
          >
            全体コメント
          </button>
        </div>

        <div class="flex items-center gap-3">
          <textarea
            disabled={busyForm}
            placeholder={busyForm ? '' : 'この瞬間にコメント...'}
            rows="1"
            class="flex-1 resize-none rounded-xl border border-border bg-surface-1 px-4 py-2.5 text-sm text-text-primary placeholder-text-muted transition-all duration-200 focus:border-accent focus:ring-1 focus:ring-accent/30 focus:outline-none disabled:opacity-40"
          ></textarea>
          <SendButton
            type="button"
            sending={formSending}
            flying={formFlying}
            onclick={simulateFlyForm}
          />
        </div>
      </div>
      <p class="mt-2 text-xs text-text-muted">
        Sendクリックで紙飛行機射出 → ローディング:
        textarea、位置切替ボタン、Sendボタンすべてが無効化
      </p>
    </div>
  </section>

  <!-- ========== Section: Spinner ========== -->
  <section class="space-y-4">
    <h2 class="font-display text-lg font-semibold text-text-primary">Spinner</h2>
    <div class="h-px bg-border-subtle"></div>

    <div class="rounded-xl border border-border-subtle bg-surface-1 p-5">
      <div class="flex items-center gap-6">
        <div class="flex flex-col items-center gap-2">
          <svg
            class="h-4 w-4 animate-spin text-accent"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          <span class="text-xs text-text-muted">h-4 w-4</span>
        </div>
        <div class="flex flex-col items-center gap-2">
          <svg
            class="h-3.5 w-3.5 animate-spin text-accent"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          <span class="text-xs text-text-muted">h-3.5 w-3.5</span>
        </div>
        <div class="flex flex-col items-center gap-2">
          <svg
            class="h-6 w-6 animate-spin text-accent"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          <span class="text-xs text-text-muted">h-6 w-6</span>
        </div>
      </div>
    </div>
  </section>

  <!-- ========== Section: Color Palette ========== -->
  <section class="space-y-4 pb-12">
    <h2 class="font-display text-lg font-semibold text-text-primary">Color Palette</h2>
    <div class="h-px bg-border-subtle"></div>

    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {#each [{ name: 'Accent', color: 'bg-accent', text: '#c9a256' }, { name: 'Accent Hover', color: 'bg-accent-hover', text: '#ddb668' }, { name: 'Nostr', color: 'bg-nostr', text: '#9b7ddb' }, { name: 'Spotify', color: 'bg-spotify', text: '#1db954' }, { name: 'YouTube', color: 'bg-youtube', text: '#ff0000' }, { name: 'Error', color: 'bg-error', text: '#e5534b' }, { name: 'Surface 0', color: 'bg-surface-0', text: '#06060a' }, { name: 'Surface 1', color: 'bg-surface-1', text: '#0f0f14' }, { name: 'Surface 2', color: 'bg-surface-2', text: '#1a1a22' }, { name: 'Surface 3', color: 'bg-surface-3', text: '#24242e' }, { name: 'Text Primary', color: 'bg-text-primary', text: '#e8e6e3' }, { name: 'Text Muted', color: 'bg-text-muted', text: '#5a584f' }] as swatch (swatch.name)}
        <div class="flex items-center gap-3 rounded-lg bg-surface-2 p-3">
          <div class="h-8 w-8 rounded-lg border border-border {swatch.color}"></div>
          <div>
            <p class="text-xs font-medium text-text-secondary">{swatch.name}</p>
            <p class="font-mono text-xs text-text-muted">{swatch.text}</p>
          </div>
        </div>
      {/each}
    </div>
  </section>
</div>

<ConfirmDialog
  open={confirmOpen}
  title="コメントを削除"
  message="このコメントを削除しますか？この操作は取り消せません。"
  confirmLabel="削除"
  cancelLabel="キャンセル"
  onConfirm={() => (confirmOpen = false)}
  onCancel={() => (confirmOpen = false)}
/>
