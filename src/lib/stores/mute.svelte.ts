/** Mute list (NIP-51 kind:10000) store with NIP-44 encryption */

import { createLogger, shortHex } from '../utils/logger.js';
import { MUTE_KIND } from '../nostr/events.js';

const log = createLogger('mute');

// --- NIP-44 encryption helpers ---

async function encryptTags(pubkey: string, tags: string[][]): Promise<string> {
  return await window.nostr!.nip44!.encrypt(pubkey, JSON.stringify(tags));
}

async function decryptTags(pubkey: string, ciphertext: string): Promise<string[][]> {
  const plaintext = await window.nostr!.nip44!.decrypt(pubkey, ciphertext);
  return JSON.parse(plaintext);
}

// --- State ---

let mutedPubkeys = $state<Set<string>>(new Set());
let mutedWords = $state<string[]>([]);
let loading = $state(false);

/** Generation counter to cancel stale loads */
let generation = 0;

// --- Exports ---

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

/**
 * Load mute list for a pubkey (called on login).
 */
export async function loadMuteList(pubkey: string): Promise<void> {
  const gen = ++generation;
  loading = true;

  log.info('Loading mute list', { pubkey: shortHex(pubkey) });

  try {
    const { fetchLatestEvent } = await import('../nostr/client.js');
    const latest = await fetchLatestEvent(pubkey, MUTE_KIND);
    if (gen !== generation) return;

    const newPubkeys = new Set<string>();
    const newWords: string[] = [];

    if (latest) {
      // Parse public tags
      for (const tag of latest.tags) {
        if (tag[0] === 'p' && tag[1]) newPubkeys.add(tag[1]);
        if (tag[0] === 'word' && tag[1]) newWords.push(tag[1].toLowerCase());
      }

      // Decrypt private tags if NIP-44 available and content is non-empty
      if (latest.content && hasNip44Support()) {
        try {
          const privateTags = await decryptTags(pubkey, latest.content);
          if (gen !== generation) return;
          for (const tag of privateTags) {
            if (tag[0] === 'p' && tag[1]) newPubkeys.add(tag[1]);
            if (tag[0] === 'word' && tag[1]) newWords.push(tag[1].toLowerCase());
          }
        } catch (err) {
          log.warn('Failed to decrypt mute list content', err);
        }
      } else if (latest.content) {
        log.warn('NIP-44 not available, skipping encrypted mute entries');
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

/** Build and publish a new kind:10000 event from current state */
async function publishMuteList(): Promise<void> {
  const { getAuth } = await import('./auth.svelte.js');
  const myPubkey = getAuth().pubkey;
  if (!myPubkey) throw new Error('Not logged in');
  if (!hasNip44Support()) throw new Error('NIP-44 not available');

  const { castSigned } = await import('../nostr/client.js');

  // All mute entries go into encrypted content (private mute list)
  const allTags: string[][] = [
    ...[...mutedPubkeys].map((pk) => ['p', pk]),
    ...mutedWords.map((w) => ['word', w])
  ];

  const encrypted = await encryptTags(myPubkey, allTags);
  await castSigned({ kind: MUTE_KIND, tags: [], content: encrypted });

  log.info('Mute list published', { pubkeys: mutedPubkeys.size, words: mutedWords.length });
}

export async function muteUser(pubkey: string): Promise<void> {
  if (mutedPubkeys.has(pubkey)) return;

  mutedPubkeys = new Set([...mutedPubkeys, pubkey]);
  log.info('Muting user', { pubkey: shortHex(pubkey) });

  await publishMuteList();
}

export async function unmuteUser(pubkey: string): Promise<void> {
  if (!mutedPubkeys.has(pubkey)) return;

  const next = new Set(mutedPubkeys);
  next.delete(pubkey);
  mutedPubkeys = next;
  log.info('Unmuting user', { pubkey: shortHex(pubkey) });

  await publishMuteList();
}

export async function muteWord(word: string): Promise<void> {
  const lower = word.toLowerCase().trim();
  if (!lower) return;
  if (mutedWords.includes(lower)) return;

  mutedWords = [...mutedWords, lower];
  log.info('Muting word', { word: lower });

  await publishMuteList();
}

export async function unmuteWord(word: string): Promise<void> {
  const lower = word.toLowerCase().trim();
  if (!mutedWords.includes(lower)) return;

  mutedWords = mutedWords.filter((w) => w !== lower);
  log.info('Unmuting word', { word: lower });

  await publishMuteList();
}

/** Clear mute list (called on logout). */
export function clearMuteList(): void {
  log.info('Clearing mute list');
  ++generation;
  mutedPubkeys = new Set();
  mutedWords = [];
  loading = false;
}
