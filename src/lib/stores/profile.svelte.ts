import { truncate, formatDisplayName } from './profile-utils.js';
import type { Profile } from './profile-utils.js';
import { createLogger, shortHex } from '../utils/logger.js';

const log = createLogger('profile');

export type { Profile } from './profile-utils.js';

const PROFILE_BATCH_SIZE = 50;
const MAX_PROFILES = 2000;

const pending = new Set<string>();
let profiles = $state<Map<string, Profile>>(new Map());

export function getProfile(pubkey: string): Profile | undefined {
  return profiles.get(pubkey);
}

export function getDisplayName(pubkey: string): string {
  return formatDisplayName(pubkey, profiles.get(pubkey));
}

export async function fetchProfile(pubkey: string): Promise<void> {
  return fetchProfiles([pubkey]);
}

/**
 * Fetch profiles for multiple pubkeys, chunked to avoid relay filter limits.
 * Skips pubkeys that are already fetched or in-flight.
 */
export async function fetchProfiles(pubkeys: string[]): Promise<void> {
  const toFetch = pubkeys.filter((pk) => !profiles.has(pk) && !pending.has(pk));
  if (toFetch.length === 0) return;

  for (const pk of toFetch) pending.add(pk);

  try {
    const [{ createRxBackwardReq }, { getRxNostr }] = await Promise.all([
      import('rx-nostr'),
      import('../nostr/client.js')
    ]);

    const rxNostr = await getRxNostr();

    // Chunk into batches to avoid relay filter size limits
    for (let i = 0; i < toFetch.length; i += PROFILE_BATCH_SIZE) {
      const chunk = toFetch.slice(i, i + PROFILE_BATCH_SIZE);
      const req = createRxBackwardReq();

      const sub = rxNostr.use(req).subscribe({
        next: (packet) => {
          try {
            const meta = JSON.parse(packet.event.content) as Record<string, unknown>;
            const profile: Profile = {
              name: typeof meta.name === 'string' ? truncate(meta.name) : undefined,
              displayName:
                typeof meta.display_name === 'string' ? truncate(meta.display_name) : undefined,
              picture: typeof meta.picture === 'string' ? meta.picture : undefined
            };
            profiles.set(packet.event.pubkey, profile);
          } catch {
            log.warn('Malformed profile JSON', { pubkey: shortHex(packet.event.pubkey) });
          }
        },
        complete: () => {
          for (const pk of chunk) {
            if (!profiles.has(pk)) {
              profiles.set(pk, {});
            }
            pending.delete(pk);
          }

          // Evict oldest entries if over limit
          if (profiles.size > MAX_PROFILES) {
            const keys = [...profiles.keys()];
            const toRemove = keys.slice(0, profiles.size - MAX_PROFILES);
            for (const k of toRemove) profiles.delete(k);
          }

          profiles = new Map(profiles);
          sub.unsubscribe();
        },
        error: (err) => {
          log.warn('Profile fetch subscription error', { error: err });
          for (const pk of chunk) pending.delete(pk);
          sub.unsubscribe();
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
