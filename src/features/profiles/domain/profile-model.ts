/**
 * Profile domain types and pure display functions.
 */

// eslint-disable-next-line no-restricted-imports -- npubEncode is a pure bech32 encoding function with no side effects
import { npubEncode } from 'nostr-tools/nip19';

export const MAX_NAME_LENGTH = 32;

export interface Profile {
  name?: string;
  displayName?: string;
  picture?: string;
  about?: string;
  nip05?: string;
  nip05valid?: boolean | null;
}

export interface ProfileDisplay {
  displayName: string;
  picture?: string;
  profileHref: string;
  nip05?: string;
  formattedNip05?: string;
}

export function formatNip05(nip05: string, truncate = false): string {
  if (!truncate) return nip05;
  return nip05.length > 20 ? `${nip05.slice(0, 18)}\u2026` : nip05;
}

export function truncateProfileName(s: string): string {
  return s.length > MAX_NAME_LENGTH ? `${s.slice(0, MAX_NAME_LENGTH)}\u2026` : s;
}

export function formatDisplayName(pubkey: string, profile: Profile | undefined): string {
  if (profile?.displayName) return profile.displayName;
  if (profile?.name) return profile.name;
  const npub = npubEncode(pubkey);
  return `${npub.slice(0, 12)}...${npub.slice(-4)}`;
}

export function getProfileHref(pubkey: string): string {
  return `/profile/${npubEncode(pubkey)}`;
}

export function describeProfileDisplay(
  pubkey: string,
  profile: Profile | undefined
): ProfileDisplay {
  const nip05 = profile?.nip05valid === true ? profile.nip05 : undefined;

  return {
    displayName: formatDisplayName(pubkey, profile),
    picture: profile?.picture,
    profileHref: getProfileHref(pubkey),
    nip05,
    formattedNip05: nip05 ? formatNip05(nip05, true) : undefined
  };
}
