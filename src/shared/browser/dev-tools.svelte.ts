import { openEventsDb } from '$shared/auftakt/resonote.js';
export interface DbStats {
  total: number;
  byKind: { kind: number; count: number }[];
}

const TRACKED_KINDS = [0, 3, 5, 7, 1111, 10000, 10002, 10003, 10030, 30030];
const EVENTS_DB_NAME = 'resonote-events';

export async function loadDbStats(): Promise<DbStats> {
  try {
    const db = await openEventsDb();
    const byKind: { kind: number; count: number }[] = [];
    let total = 0;
    for (const kind of TRACKED_KINDS) {
      const events = await db.getAllByKind(kind);
      if (events.length > 0) {
        byKind.push({ kind, count: events.length });
        total += events.length;
      }
    }
    return { total, byKind };
  } catch {
    return { total: 0, byKind: [] };
  }
}

export async function clearIndexedDB(): Promise<void> {
  const db = await openEventsDb();
  await db.clearAll();
}

export function clearLocalStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function clearAllData(): void {
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
  indexedDB.deleteDatabase(EVENTS_DB_NAME);
  window.location.reload();
}

export function checkServiceWorkerStatus(): 'active' | 'none' {
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    return 'active';
  }
  return 'none';
}

export async function checkServiceWorkerUpdate(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false;
  const reg = await navigator.serviceWorker.getRegistration();
  if (reg) {
    await reg.update();
    return true;
  }
  return false;
}

export interface DebugInfo {
  app: string;
  url: string;
  userAgent: string;
  locale: string;
  auth: { loggedIn: boolean; pubkey: string | null };
  relays: { url: string; state: string }[];
  cache: DbStats | null;
  sw: 'active' | 'none';
  timestamp: string;
}

export function buildDebugInfo(
  auth: { loggedIn: boolean; pubkey: string | null },
  relays: { url: string; state: string }[],
  dbStats: DbStats | null,
  swStatus: 'active' | 'none'
): DebugInfo {
  return {
    app: 'Resonote',
    url: window.location.href,
    userAgent: navigator.userAgent,
    locale: document.documentElement.lang,
    auth: {
      loggedIn: auth.loggedIn,
      pubkey: auth.pubkey ? `${auth.pubkey.slice(0, 8)}...` : null
    },
    relays,
    cache: dbStats,
    sw: swStatus,
    timestamp: new Date().toISOString()
  };
}
