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

export function formatNip05(nip05: string, truncate = false): string {
  if (!truncate) return nip05;
  return nip05.length > 20 ? nip05.slice(0, 18) + '…' : nip05;
}

export function truncate(s: string): string {
  return s.length > MAX_NAME_LENGTH ? s.slice(0, MAX_NAME_LENGTH) + '…' : s;
}

export function formatDisplayName(pubkey: string, profile: Profile | undefined): string {
  if (profile?.displayName) return profile.displayName;
  if (profile?.name) return profile.name;
  const npub = npubEncode(pubkey);
  return `${npub.slice(0, 12)}...${npub.slice(-4)}`;
}
