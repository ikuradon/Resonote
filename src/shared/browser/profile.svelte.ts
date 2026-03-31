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

const PROFILE_BATCH_SIZE = 50;
const MAX_PROFILES = 2000;

const pending = new Set<string>();
let profiles = $state<Map<string, Profile>>(new Map());

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
  let toFetch = pubkeys.filter((pk) => !profiles.has(pk) && !pending.has(pk));
  if (toFetch.length === 0) return;

  for (const pk of toFetch) pending.add(pk);

  try {
    const { getStoreAsync } = await import('$shared/nostr/store.js');
    const store = await getStoreAsync();
    const cached = await store.getSync({ kinds: [0], authors: toFetch });

    for (const cachedEvent of cached) {
      try {
        const profile = parseProfileContent(cachedEvent.event.content);
        profiles.set(cachedEvent.event.pubkey, profile);
      } catch {
        log.warn('Malformed cached profile JSON', { pubkey: shortHex(cachedEvent.event.pubkey) });
      }
    }

    toFetch = toFetch.filter((pk) => !profiles.has(pk));
    if (toFetch.length === 0) {
      profiles = new Map(profiles);
      for (const pk of pubkeys) pending.delete(pk);
      return;
    }

    const [{ createRxBackwardReq }, { getRxNostr }] = await Promise.all([
      import('rx-nostr'),
      import('$shared/nostr/client.js')
    ]);
    const rxNostr = await getRxNostr();

    for (let i = 0; i < toFetch.length; i += PROFILE_BATCH_SIZE) {
      const chunk = toFetch.slice(i, i + PROFILE_BATCH_SIZE);
      const req = createRxBackwardReq();

      const sub = rxNostr.use(req).subscribe({
        next: (packet: { event: { pubkey: string; content: string }; from: string }) => {
          const pk = packet.event.pubkey;
          if (profiles.has(pk)) return;
          try {
            const profile = parseProfileContent(packet.event.content);
            profiles.set(pk, profile);
            // connectStore() handles caching automatically
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
          profiles = new Map(profiles);
        },
        complete: () => {
          sub.unsubscribe();
          for (const pk of chunk) {
            if (!profiles.has(pk)) {
              profiles.set(pk, {});
            }
            pending.delete(pk);
          }

          if (profiles.size > MAX_PROFILES) {
            const keys = [...profiles.keys()];
            const toRemove = keys.slice(0, profiles.size - MAX_PROFILES);
            for (const key of toRemove) profiles.delete(key);
          }

          profiles = new Map(profiles);
        },
        error: (err: unknown) => {
          log.warn('Profile fetch subscription error', { error: err });
          sub.unsubscribe();
          for (const pk of chunk) pending.delete(pk);
        }
      });

      req.emit({ kinds: [0], authors: chunk });
      req.over();
    }
  } catch (err) {
    log.error('Profile fetch failed', { error: err });
    for (const pk of toFetch) pending.delete(pk);
  }
}

/** Clear in-memory profile cache (called on logout). DB cleared separately. */
export function clearProfiles(): void {
  profiles = new Map();
  pending.clear();
}
