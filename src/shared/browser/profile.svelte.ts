import {
  describeProfileDisplay,
  formatDisplayName,
  type Profile,
  type ProfileDisplay,
  truncateProfileName
} from '$features/profiles/domain/profile-model.js';
import { fetchProfileMetadataSources } from '$shared/auftakt/resonote.js';
import { createLogger, shortHex } from '$shared/utils/logger.js';
import { sanitizeUrl } from '$shared/utils/url.js';

const log = createLogger('profile');

const PROFILE_BATCH_SIZE = 50;
const MAX_PROFILES = 2000;

const pending = new Set<string>();
const retryQueued = new Set<string>();
let profiles = $state<Map<string, Profile>>(new Map());

function isUnresolvedPlaceholderProfile(profile: Profile | undefined): boolean {
  return profile !== undefined && Object.keys(profile).length === 0;
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

function queueRetryIfNeeded(pubkey: string): void {
  if (!retryQueued.has(pubkey)) return;
  retryQueued.delete(pubkey);
  queueMicrotask(() => {
    void fetchProfiles([pubkey]);
  });
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
  for (const pk of pubkeys) {
    if (pending.has(pk)) {
      retryQueued.add(pk);
    }
  }

  let toFetch = pubkeys.filter((pk) => {
    if (pending.has(pk)) return false;
    const existing = profiles.get(pk);
    return existing === undefined || isUnresolvedPlaceholderProfile(existing);
  });
  if (toFetch.length === 0) return;

  for (const pk of toFetch) pending.add(pk);

  try {
    const { cachedEvents, fetchedEvents, fallbackEvents, unresolvedPubkeys } =
      await fetchProfileMetadataSources(toFetch, PROFILE_BATCH_SIZE);

    for (const event of cachedEvents) {
      try {
        const profile = parseProfileContent(event.content);
        profiles.set(event.pubkey, profile);
      } catch {
        log.warn('Malformed cached profile JSON', { pubkey: shortHex(event.pubkey) });
      }
    }

    for (const event of fetchedEvents) {
      try {
        const profile = parseProfileContent(event.content);
        profiles.set(event.pubkey, profile);
        const nip05 = profile.nip05;
        if (nip05) {
          void import('$shared/nostr/nip05.js').then(({ verifyNip05 }) =>
            verifyNip05(nip05, event.pubkey).then((result) => {
              const existing = profiles.get(event.pubkey);
              if (existing && existing.nip05 === profile.nip05) {
                const updated = { ...existing, nip05valid: result.valid };
                profiles.set(event.pubkey, updated);
                profiles = new Map(profiles);
              }
            })
          );
        }
      } catch {
        log.warn('Malformed profile JSON', { pubkey: shortHex(event.pubkey) });
      }
    }

    for (const event of fallbackEvents) {
      try {
        const profile = parseProfileContent(event.content);
        profiles.set(event.pubkey, profile);
      } catch {
        log.warn('Malformed profile JSON from latest-event fallback', {
          pubkey: shortHex(event.pubkey)
        });
      }
    }

    toFetch = unresolvedPubkeys;
    if (toFetch.length === 0) {
      profiles = new Map(profiles);
      for (const pk of pubkeys) {
        pending.delete(pk);
        queueRetryIfNeeded(pk);
      }
      return;
    }

    for (const pk of toFetch) {
      if (!profiles.has(pk)) {
        profiles.set(pk, {});
      }
      pending.delete(pk);
      queueRetryIfNeeded(pk);
    }

    if (profiles.size > MAX_PROFILES) {
      const keys = [...profiles.keys()];
      const toRemove = keys.slice(0, profiles.size - MAX_PROFILES);
      for (const key of toRemove) profiles.delete(key);
    }

    profiles = new Map(profiles);
  } catch (err) {
    log.warn('Profile fetch subscription error', { error: err });
    for (const pk of toFetch) {
      pending.delete(pk);
      queueRetryIfNeeded(pk);
    }
  }
}

/** Clear in-memory profile cache (called on logout). DB cleared separately. */
export function clearProfiles(): void {
  profiles = new Map();
  pending.clear();
  retryQueued.clear();
}
