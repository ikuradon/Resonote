import { describe, expect, it } from 'vitest';

import { checkStrictClosure, type StrictClosureFile } from './check-auftakt-strict-closure.ts';

function file(path: string, text: string): StrictClosureFile {
  return { path, text };
}

describe('checkStrictClosure', () => {
  it('flags active adapter-indexeddb imports and package folders', () => {
    const result = checkStrictClosure([
      file('src/shared/nostr/event-db.ts', "import { x } from '@auftakt/adapter-indexeddb';"),
      file('packages/adapter-indexeddb/src/index.ts', 'export {};')
    ]);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      'src/shared/nostr/event-db.ts imports @auftakt/adapter-indexeddb'
    );
    expect(result.errors).toContain('packages/adapter-indexeddb exists');
  });

  it('flags no-op production quarantine writers', () => {
    const result = checkStrictClosure([
      file(
        'packages/resonote/src/runtime.ts',
        'void ingestRelayEvent({ event, relayUrl, materialize, quarantine: async () => {} });'
      )
    ]);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      'packages/resonote/src/runtime.ts contains production no-op quarantine writer'
    );
  });

  it('flags raw relay packet event returns in production helpers', () => {
    const result = checkStrictClosure([
      file('packages/resonote/src/runtime.ts', 'events.push(packet.event as TEvent);')
    ]);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      'packages/resonote/src/runtime.ts exposes raw packet.event to public results'
    );
  });

  it('requires queue and gateway production references', () => {
    const result = checkStrictClosure([
      file(
        'packages/resonote/src/materializer-queue.ts',
        'export function createMaterializerQueue() {}'
      ),
      file('packages/resonote/src/relay-gateway.ts', 'export function createRelayGateway() {}'),
      file(
        'packages/resonote/src/event-coordinator.ts',
        'export function createEventCoordinator() {}'
      ),
      file('packages/resonote/src/runtime.ts', 'export const runtime = {};')
    ]);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('createMaterializerQueue is not referenced by production code');
    expect(result.errors).toContain('createRelayGateway is not referenced by production code');
  });

  it('ignores queue and gateway references from tests', () => {
    const result = checkStrictClosure([
      file(
        'packages/resonote/src/materializer-queue.contract.test.ts',
        'import { createMaterializerQueue } from "./materializer-queue.js";'
      ),
      file(
        'packages/resonote/src/relay-gateway.contract.test.ts',
        'import { createRelayGateway } from "./relay-gateway.js";'
      ),
      file('packages/resonote/src/runtime.ts', 'export const runtime = {};')
    ]);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('createMaterializerQueue is not referenced by production code');
    expect(result.errors).toContain('createRelayGateway is not referenced by production code');
  });

  it('flags standalone pending publish idb storage', () => {
    const result = checkStrictClosure([
      file('src/shared/nostr/pending-publishes.ts', "import { openDB } from 'idb';")
    ]);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      'src/shared/nostr/pending-publishes.ts still uses standalone idb storage'
    );
  });

  it('passes when strict closure invariants are satisfied', () => {
    const result = checkStrictClosure([
      file(
        'packages/resonote/src/event-coordinator.ts',
        'import { createMaterializerQueue } from "./materializer-queue.js";'
      ),
      file(
        'packages/resonote/src/runtime.ts',
        'import { createRelayGateway } from "./relay-gateway.js"; const quarantine = writeQuarantine;'
      ),
      file('src/shared/nostr/pending-publishes.ts', 'import { getEventsDB } from "./event-db.js";')
    ]);

    expect(result).toEqual({ ok: true, errors: [] });
  });
});
