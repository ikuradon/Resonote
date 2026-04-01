import {
  describeProfileDisplay,
  formatDisplayName,
  type Profile,
  type ProfileDisplay,
  truncateProfileName
} from '$features/profiles/domain/profile-model.js';
import { createLogger, shortHex } from '$shared/utils/logger.js';
import { sanitizeUrl } from '$shared/utils/url.js';

const log = createLogger('profile');

const MAX_PROFILES = 2000;

const pending = new Set<string>();
const loadedPubkeys = new Set<string>();
let profiles = $state<Map<string, Profile>>(new Map());

function hasLoadedProfile(pubkey: string): boolean {
  return loadedPubkeys.has(pubkey);
}

function parseProfileContent(content: string): Profile {
  const meta = JSON.parse(content) as Record<string, unknown>;
  return {
    name: typeof meta.name === 'string' ? truncateProfileName(meta.name) : undefined,
    displayName:
      typeof meta.display_name === 'string' ? truncateProfileName(meta.display_name) : undefined,
    picture: typeof meta.picture === 'string' ? sanitizeUrl(meta.picture) : undefined,
    about: typeof meta.about === 'string' ? meta.about : undefined,
    nip05: typeof meta.nip05 === 'string' ? meta.nip05 : undefined
  };
}

export function getProfile(pubkey: string): Profile | undefined {
  return profiles.get(pubkey);
}

export function getDisplayName(pubkey: string): string {
  return formatDisplayName(pubkey, profiles.get(pubkey));
}

export function getProfileDisplay(pubkey: string): ProfileDisplay {
  return describeProfileDisplay(pubkey, profiles.get(pubkey));
}

export async function fetchProfile(pubkey: string): Promise<void> {
  return fetchProfiles([pubkey]);
}

/**
 * Fetch profiles for multiple pubkeys, chunked to avoid relay filter limits.
 * Skips pubkeys that are already fetched or in-flight.
 * Falls back to DB cache before making relay requests.
 */
export async function fetchProfiles(pubkeys: string[]): Promise<void> {
  const claimedPubkeys = pubkeys.filter((pk) => !hasLoadedProfile(pk) && !pending.has(pk));
  let toFetch = claimedPubkeys;
  if (toFetch.length === 0) return;

  for (const pk of claimedPubkeys) pending.add(pk);

  try {
    const { getStoreAsync } = await import('$shared/nostr/store.js');
    const store = await getStoreAsync();
    const cached = await store.getSync({ kinds: [0], authors: toFetch });

    for (const cachedEvent of cached) {
      try {
        const profile = parseProfileContent(cachedEvent.event.content);
        profiles.set(cachedEvent.event.pubkey, profile);
        loadedPubkeys.add(cachedEvent.event.pubkey);
      } catch {
        log.warn('Malformed cached profile JSON', { pubkey: shortHex(cachedEvent.event.pubkey) });
      }
    }

    toFetch = toFetch.filter((pk) => !hasLoadedProfile(pk));
    if (toFetch.length === 0) {
      profiles = new Map(profiles);
      return;
    }

    const [{ fetchLatestBatch }, { getRxNostr }] = await Promise.all([
      import('@ikuradon/auftakt/sync'),
      import('$shared/nostr/client.js')
    ]);
    const rxNostr = await getRxNostr();

    // Batch fetch missing profiles via single backward REQ
    try {
      const relayResults = await fetchLatestBatch(rxNostr, store, toFetch, 0, { timeout: 10_000 });
      const cachedAfterFetch = await store.getSync({ kinds: [0], authors: toFetch });
      const resultsByPubkey = new Map<string, (typeof relayResults)[number]>();
      for (const ce of relayResults) {
        resultsByPubkey.set(ce.event.pubkey, ce);
      }
      for (const ce of cachedAfterFetch) {
        resultsByPubkey.set(ce.event.pubkey, ce);
      }
      const results = [...resultsByPubkey.values()];
      for (const ce of results) {
        const pk = ce.event.pubkey;
        if (hasLoadedProfile(pk)) continue;
        try {
          const profile = parseProfileContent(ce.event.content);
          profiles.set(pk, profile);
          loadedPubkeys.add(pk);
          const nip05 = profile.nip05;
          if (nip05) {
            void import('$shared/nostr/nip05.js').then(({ verifyNip05 }) =>
              verifyNip05(nip05, pk).then((result) => {
                const existing = profiles.get(pk);
                if (existing && existing.nip05 === profile.nip05) {
                  const updated = { ...existing, nip05valid: result.valid };
                  profiles.set(pk, updated);
                  profiles = new Map(profiles);
                }
              })
            );
          }
        } catch {
          log.warn('Malformed profile JSON', { pubkey: shortHex(pk) });
        }
      }
    } catch (err) {
      log.warn('Profile batch fetch failed', { error: err });
    }

    // Set empty profile for pubkeys not returned by relay
    for (const pk of toFetch) {
      if (!profiles.has(pk)) {
        profiles.set(pk, {});
        loadedPubkeys.add(pk);
      }
    }

    if (profiles.size > MAX_PROFILES) {
      const keys = [...profiles.keys()];
      const toRemove = keys.slice(0, profiles.size - MAX_PROFILES);
      for (const key of toRemove) {
        profiles.delete(key);
        loadedPubkeys.delete(key);
      }
    }

    profiles = new Map(profiles);
  } catch (err) {
    log.error('Profile fetch failed', { error: err });
  } finally {
    for (const pk of claimedPubkeys) pending.delete(pk);
  }
}

/** Clear in-memory profile cache (called on logout). DB cleared separately. */
export function clearProfiles(): void {
  profiles = new Map();
  pending.clear();
  loadedPubkeys.clear();
}
