import { truncate, formatDisplayName } from './profile-utils.js';
import type { Profile } from './profile-utils.js';
import { createLogger, shortHex } from '../utils/logger.js';

const log = createLogger('profile');

export type { Profile } from './profile-utils.js';

const pending = new Set<string>();
let profiles = $state<Map<string, Profile>>(new Map());

export function getProfile(pubkey: string): Profile | undefined {
  return profiles.get(pubkey);
}

export function getDisplayName(pubkey: string): string {
  return formatDisplayName(pubkey, profiles.get(pubkey));
}

export async function fetchProfile(pubkey: string): Promise<void> {
  if (profiles.has(pubkey) || pending.has(pubkey)) return;
  pending.add(pubkey);

  try {
    const [{ createRxBackwardReq }, { getRxNostr }] = await Promise.all([
      import('rx-nostr'),
      import('../nostr/client.js')
    ]);

    const rxNostr = await getRxNostr();
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
          profiles.set(pubkey, profile);
          profiles = new Map(profiles);
        } catch {
          log.warn('Malformed profile JSON', { pubkey: shortHex(pubkey) });
        }
      },
      complete: () => {
        if (!profiles.has(pubkey)) {
          profiles.set(pubkey, {});
          profiles = new Map(profiles);
        }
        pending.delete(pubkey);
        sub.unsubscribe();
      },
      error: (err) => {
        log.warn('Profile fetch subscription error', { pubkey: shortHex(pubkey), error: err });
        pending.delete(pubkey);
        sub.unsubscribe();
      }
    });

    req.emit({ kinds: [0], authors: [pubkey], limit: 1 });
    req.over();
  } catch (err) {
    log.error('Profile fetch failed', { pubkey: shortHex(pubkey), error: err });
    pending.delete(pubkey);
  }
}
