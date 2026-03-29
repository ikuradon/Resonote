import { createLogger } from '$shared/utils/logger.js';

const log = createLogger('nostr:nip05');

export interface Nip05Result {
  valid: boolean | null;
  nip05: string;
  checkedAt: number;
}

const CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_CACHE_SIZE = 500;
const MAX_CONCURRENT = 5;
const TIMEOUT_MS = 5000;

const cache = new Map<string, Nip05Result>();

let activeCount = 0;
const queue: Array<() => void> = [];

function runNext(): void {
  if (queue.length > 0 && activeCount < MAX_CONCURRENT) {
    const next = queue.shift();
    next?.();
  }
}

async function withConcurrencyLimit<T>(fn: () => Promise<T>): Promise<T> {
  if (activeCount >= MAX_CONCURRENT) {
    await new Promise<void>((resolve) => queue.push(resolve));
  }
  activeCount++;
  try {
    return await fn();
  } finally {
    activeCount--;
    runNext();
  }
}

function isUnsafeDomain(domain: string): boolean {
  if (!domain || domain === 'localhost') return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(domain)) return true;
  if (domain.startsWith('[') || domain.includes(':')) return true;
  return false;
}

async function fetchNip05(nip05: string, pubkey: string): Promise<Nip05Result> {
  const atIndex = nip05.indexOf('@');
  if (atIndex === -1 || atIndex === 0 || atIndex === nip05.length - 1) {
    log.warn('Invalid NIP-05 format', { nip05 });
    return { valid: false, nip05, checkedAt: Date.now() };
  }

  const local = nip05.slice(0, atIndex);
  const domain = nip05.slice(atIndex + 1);

  if (isUnsafeDomain(domain)) {
    log.warn('NIP-05 unsafe domain rejected', { domain, nip05 });
    return { valid: false, nip05, checkedAt: Date.now() };
  }
  const url = `https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(local)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    log.debug('Fetching NIP-05', { url });
    const response = await fetch(url, {
      redirect: 'error',
      signal: controller.signal
    });

    if (!response.ok) {
      log.warn('NIP-05 fetch returned non-OK status', { status: response.status, nip05 });
      return { valid: null, nip05, checkedAt: Date.now() };
    }

    const json = await response.json();
    const resolvedPubkey = json?.names?.[local];

    if (resolvedPubkey === pubkey) {
      log.info('NIP-05 verified', { nip05 });
      return { valid: true, nip05, checkedAt: Date.now() };
    }

    log.info('NIP-05 pubkey mismatch', { nip05, expected: pubkey, got: resolvedPubkey });
    return { valid: false, nip05, checkedAt: Date.now() };
  } catch (err) {
    log.warn('NIP-05 fetch error (CORS/network/redirect)', { nip05, err });
    return { valid: null, nip05, checkedAt: Date.now() };
  } finally {
    clearTimeout(timer);
  }
}

export async function verifyNip05(nip05: string, pubkey: string): Promise<Nip05Result> {
  const cacheKey = `${nip05}:${pubkey}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.checkedAt < CACHE_TTL_MS) {
    log.debug('NIP-05 cache hit', { nip05 });
    return cached;
  }

  const result = await withConcurrencyLimit(() => fetchNip05(nip05, pubkey));
  if (!cache.has(cacheKey) && cache.size >= MAX_CACHE_SIZE) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(cacheKey, result);
  return result;
}

export function clearNip05Cache(): void {
  cache.clear();
}
