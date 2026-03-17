<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { decodeNip19 } from '$lib/nostr/nip19-decode.js';
  import { decodeContentLink, iTagToContentPath } from '$lib/nostr/content-link.js';
  import { t, type TranslationKey } from '$lib/i18n/t.js';

  let param = $derived(page.params.nip19 ?? '');
  let error = $state<TranslationKey | null>(null);
  let loading = $state(true);
  let contentPath = $state<string | null>(null);

  const VALID_PREFIXES = ['npub1', 'nprofile1', 'nevent1', 'note1', 'ncontent1'];

  $effect(() => {
    const value = param;
    if (!value) return;

    // Validate prefix
    const hasValidPrefix = VALID_PREFIXES.some((p) => value.startsWith(p));
    if (!hasValidPrefix) {
      error = 'nip19.invalid';
      loading = false;
      return;
    }

    loading = true;
    error = null;
    contentPath = null;
    handleRoute(value);
  });

  async function handleRoute(value: string) {
    // Try ncontent first
    if (value.startsWith('ncontent1')) {
      const decoded = decodeContentLink(value);
      if (!decoded) {
        error = 'nip19.invalid';
        loading = false;
        return;
      }
      // TODO: merge relay hints with user's relay set for subscriptions
      const { contentId } = decoded;
      goto(`/${contentId.platform}/${contentId.type}/${contentId.id}`, { replaceState: true });
      return;
    }

    // Try standard NIP-19
    const decoded = decodeNip19(value);
    if (!decoded) {
      error = 'nip19.invalid';
      loading = false;
      return;
    }

    switch (decoded.type) {
      case 'npub':
        goto(`/profile/${value}`, { replaceState: true });
        return;
      case 'nprofile':
        goto(`/profile/${value}`, { replaceState: true });
        return;
      case 'note':
      case 'nevent': {
        // Fetch event from relay hints
        try {
          const event = await fetchEvent(
            decoded.eventId,
            'relays' in decoded ? decoded.relays : []
          );
          if (!event) {
            error = 'nip19.not_found';
            loading = false;
            return;
          }
          // Extract I tag for content reference
          const iTag = event.tags.find((tag: string[]) => tag[0] === 'I' && tag[1]);
          if (event.kind !== 1111) {
            error = 'nip19.not_comment';
            loading = false;
            // If there's an I tag, we can still link to content
            if (iTag) {
              const path = iTagToContentPath(iTag[1]);
              if (path) contentPath = path;
            }
            return;
          }
          if (iTag) {
            // Parse content ID from I tag value (e.g., "spotify:track:abc123")
            const path = iTagToContentPath(iTag[1]);
            if (path) {
              goto(path, { replaceState: true });
              return;
            }
          }
          error = 'nip19.not_found';
          loading = false;
        } catch {
          error = 'nip19.not_found';
          loading = false;
        }
        return;
      }
    }
  }

  async function fetchEvent(eventId: string, relayHints: string[]) {
    const [{ createRxBackwardReq }, { getRxNostr }] = await Promise.all([
      import('rx-nostr'),
      import('$lib/nostr/client.js')
    ]);
    const rxNostr = await getRxNostr();

    // Temporarily add relay hints
    if (relayHints.length > 0) {
      const current = Object.keys(rxNostr.getDefaultRelays());
      const newRelays = relayHints.filter((r) => !current.includes(r));
      if (newRelays.length > 0) {
        rxNostr.addDefaultRelays(newRelays);
      }
      // Note: we don't remove them after - they'll be useful for the content page too
    }

    const fetchPromise = new Promise<{ kind: number; tags: string[][]; content: string } | null>(
      (resolve) => {
        const req = createRxBackwardReq();
        let found: { kind: number; tags: string[][]; content: string } | null = null;

        const sub = rxNostr.use(req).subscribe({
          next: (packet) => {
            found = packet.event;
          },
          complete: () => {
            sub.unsubscribe();
            resolve(found);
          },
          error: () => {
            sub.unsubscribe();
            resolve(found);
          }
        });

        req.emit({ ids: [eventId] });
        req.over();
      }
    );

    const timeoutPromise = new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), 10_000);
    });

    return Promise.race([fetchPromise, timeoutPromise]);
  }
</script>

<svelte:head>
  <title>Resonote</title>
</svelte:head>

{#if loading}
  <div class="flex flex-col items-center gap-6 pt-20">
    <p class="font-display text-lg text-text-secondary">{t('nip19.loading')}</p>
  </div>
{:else if error}
  <div class="flex flex-col items-center gap-6 pt-20">
    <p class="font-display text-lg text-text-secondary">{t(error)}</p>
    {#if error === 'nip19.not_comment' && contentPath}
      <a
        href={contentPath}
        class="rounded-xl bg-accent px-6 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:bg-accent-hover"
      >
        {t('nip19.view_content')}
      </a>
    {/if}
    <a href="/" class="text-sm text-accent transition-colors hover:text-accent-hover">
      {t('content.back_home')}
    </a>
  </div>
{/if}
