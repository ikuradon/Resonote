import { MUTE_KIND } from '$shared/nostr/events.js';
import { createLogger, shortHex } from '$shared/utils/logger.js';

import { getAuth } from './auth.svelte.js';

const log = createLogger('mute');

async function encryptTags(pubkey: string, tags: string[][]): Promise<string> {
  const nip44 = window.nostr?.nip44;
  if (!nip44) throw new Error('NIP-44 encryption not available');
  return await nip44.encrypt(pubkey, JSON.stringify(tags));
}

async function decryptTags(pubkey: string, ciphertext: string): Promise<string[][]> {
  const nip44 = window.nostr?.nip44;
  if (!nip44) throw new Error('NIP-44 decryption not available');
  const plaintext = await nip44.decrypt(pubkey, ciphertext);
  return JSON.parse(plaintext);
}

async function decryptTagsNip04(pubkey: string, ciphertext: string): Promise<string[][]> {
  const nip04 = window.nostr?.nip04;
  if (!nip04) throw new Error('NIP-04 decryption not available');
  const plaintext = await nip04.decrypt(pubkey, ciphertext);
  return JSON.parse(plaintext);
}

export type EncryptionScheme = 'nip44' | 'nip04' | 'new' | 'undecryptable';

let mutedPubkeys = $state<Set<string>>(new Set());
let mutedWords = $state<string[]>([]);
let loading = $state(false);
let encryptionScheme = $state<EncryptionScheme>('new');
let preservedPrivateTags = $state<string[][]>([]);
let generation = 0;

export function getMuteList() {
  return {
    get mutedPubkeys() {
      return mutedPubkeys;
    },
    get mutedWords() {
      return mutedWords;
    },
    get loading() {
      return loading;
    },
    get encryptionScheme() {
      return encryptionScheme;
    }
  };
}

export function isMuted(pubkey: string): boolean {
  return mutedPubkeys.has(pubkey);
}

export function isWordMuted(content: string): boolean {
  if (mutedWords.length === 0) return false;
  const lower = content.toLowerCase();
  return mutedWords.some((w) => lower.includes(w));
}

export function hasNip44Support(): boolean {
  return typeof window !== 'undefined' && !!window.nostr?.nip44;
}

export function hasNip04Support(): boolean {
  return typeof window !== 'undefined' && !!window.nostr?.nip04;
}

export function hasEncryptionSupport(): boolean {
  return hasNip44Support() || hasNip04Support();
}

export async function loadMuteList(pubkey: string): Promise<void> {
  const gen = ++generation;
  loading = true;

  log.info('Loading mute list', { pubkey: shortHex(pubkey) });

  try {
    const { fetchLatest } = await import('$shared/nostr/store.js');
    const latest = await fetchLatest(pubkey, MUTE_KIND, { directFallback: true });
    if (gen !== generation) return;

    const newPubkeys = new Set<string>();
    const newWords: string[] = [];

    if (latest) {
      for (const tag of latest.tags) {
        if (tag[0] === 'p' && tag[1]) newPubkeys.add(tag[1]);
        if (tag[0] === 'word' && tag[1]) newWords.push(tag[1].toLowerCase());
      }

      if (latest.content) {
        let decryptedTags: string[][] | null = null;

        // Try NIP-44 first
        if (hasNip44Support()) {
          try {
            decryptedTags = await decryptTags(pubkey, latest.content);
            if (gen !== generation) return;
            encryptionScheme = 'nip44';
          } catch {
            log.debug('NIP-44 decrypt failed, trying NIP-04 fallback');
          }
        }

        // Fallback to NIP-04
        if (decryptedTags === null && hasNip04Support()) {
          try {
            decryptedTags = await decryptTagsNip04(pubkey, latest.content);
            if (gen !== generation) return;
            encryptionScheme = 'nip04';
          } catch {
            log.warn('Both NIP-44 and NIP-04 decrypt failed');
          }
        }

        if (!decryptedTags && latest.content) {
          // Cannot decrypt — block editing to prevent private tag loss
          encryptionScheme = 'undecryptable';
        }

        if (decryptedTags) {
          const otherTags: string[][] = [];
          for (const tag of decryptedTags) {
            if (tag[0] === 'p' && tag[1]) newPubkeys.add(tag[1]);
            else if (tag[0] === 'word' && tag[1]) newWords.push(tag[1].toLowerCase());
            else otherTags.push(tag);
          }
          preservedPrivateTags = otherTags;
        }
      } else {
        encryptionScheme = 'new';
        preservedPrivateTags = [];
      }
    }

    mutedPubkeys = newPubkeys;
    mutedWords = newWords;
    log.info('Mute list loaded', { pubkeys: newPubkeys.size, words: newWords.length });
  } finally {
    if (gen === generation) {
      loading = false;
    }
  }
}

async function publishMuteList(useScheme?: EncryptionScheme): Promise<void> {
  const myPubkey = getAuth().pubkey;
  if (!myPubkey) throw new Error('Not logged in');

  const scheme = useScheme ?? encryptionScheme;

  const allTags: string[][] = [
    ...[...mutedPubkeys].map((pk) => ['p', pk]),
    ...mutedWords.map((w) => ['word', w]),
    ...preservedPrivateTags
  ];

  // Resolve actual encryption method: 'new' falls back to best available
  const resolvedScheme = scheme === 'new' ? (hasNip44Support() ? 'nip44' : 'nip04') : scheme;

  let encrypted: string;
  if (resolvedScheme === 'nip04') {
    const nip04 = window.nostr?.nip04;
    if (!nip04) throw new Error('NIP-04 not available');
    encrypted = await nip04.encrypt(myPubkey, JSON.stringify(allTags));
  } else {
    if (!hasNip44Support()) throw new Error('NIP-44 not available');
    encrypted = await encryptTags(myPubkey, allTags);
  }

  const { publishMuteList: publish } = await import('$features/mute/application/mute-actions.js');
  await publish(encrypted);

  if (useScheme) encryptionScheme = useScheme;
  else if (scheme === 'new') encryptionScheme = resolvedScheme;
  log.info('Mute list published', {
    scheme: resolvedScheme,
    pubkeys: mutedPubkeys.size,
    words: mutedWords.length
  });
}

export async function muteUser(pubkey: string, useScheme?: EncryptionScheme): Promise<void> {
  if (mutedPubkeys.has(pubkey)) return;

  mutedPubkeys = new Set([...mutedPubkeys, pubkey]);
  log.info('Muting user', { pubkey: shortHex(pubkey) });

  await publishMuteList(useScheme);
}

export async function unmuteUser(pubkey: string, useScheme?: EncryptionScheme): Promise<void> {
  if (!mutedPubkeys.has(pubkey)) return;

  const next = new Set(mutedPubkeys);
  next.delete(pubkey);
  mutedPubkeys = next;
  log.info('Unmuting user', { pubkey: shortHex(pubkey) });

  await publishMuteList(useScheme);
}

export async function muteWord(word: string, useScheme?: EncryptionScheme): Promise<void> {
  const lower = word.toLowerCase().trim();
  if (!lower) return;
  if (mutedWords.includes(lower)) return;

  mutedWords = [...mutedWords, lower];
  log.info('Muting word', { word: lower });

  await publishMuteList(useScheme);
}

export async function unmuteWord(word: string, useScheme?: EncryptionScheme): Promise<void> {
  const lower = word.toLowerCase().trim();
  if (!mutedWords.includes(lower)) return;

  mutedWords = mutedWords.filter((w) => w !== lower);
  log.info('Unmuting word', { word: lower });

  await publishMuteList(useScheme);
}

export function clearMuteList(): void {
  log.info('Clearing mute list');
  ++generation;
  mutedPubkeys = new Set();
  mutedWords = [];
  preservedPrivateTags = [];
  encryptionScheme = 'new';
  loading = false;
}
