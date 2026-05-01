import { parseNip24ProfileMetadataJson } from '@auftakt/core';

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
  const meta = parseNip24ProfileMetadataJson(content);
  if (!meta) {
    throw new Error('Malformed NIP-24 profile metadata JSON');
  }
  return {
    name: meta.name ? truncateProfileName(meta.name) : undefined,
    displayName: meta.displayName ? truncateProfileName(meta.displayName) : undefined,
    picture: meta.picture ? sanitizeUrl(meta.picture) : undefined,
    about: meta.about,
    nip05: meta.nip05,
    website: meta.website ? sanitizeUrl(meta.website) : undefined,
    banner: meta.banner ? sanitizeUrl(meta.banner) : undefined,
    bot: meta.bot,
    birthday: meta.birthday
  };
}

function queueRetryIfNeeded(pubkey: string): void {
  if (!retryQueued.has(pubkey)) return;
  retryQueued.delete(pubkey);
  queueMicrotask(() => {
    void fetchProfiles([pubkey]);
  });
}

function releasePending(pubkeys: Iterable<string>): void {
  for (const pk of pubkeys) {
    pending.delete(pk);
    queueRetryIfNeeded(pk);
  }
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

  const startedPubkeys = toFetch;
  for (const pk of startedPubkeys) pending.add(pk);

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
      releasePending(startedPubkeys);
      return;
    }

    for (const pk of toFetch) {
      if (!profiles.has(pk)) {
        profiles.set(pk, {});
      }
    }
    releasePending(startedPubkeys);

    if (profiles.size > MAX_PROFILES) {
      const keys = [...profiles.keys()];
      const toRemove = keys.slice(0, profiles.size - MAX_PROFILES);
      for (const key of toRemove) profiles.delete(key);
    }

    profiles = new Map(profiles);
  } catch (err) {
    log.warn('Profile fetch subscription error', { error: err });
    releasePending(startedPubkeys);
  }
}

/** Clear in-memory profile cache (called on logout). DB cleared separately. */
export function clearProfiles(): void {
  profiles = new Map();
  pending.clear();
  retryQueued.clear();
}
