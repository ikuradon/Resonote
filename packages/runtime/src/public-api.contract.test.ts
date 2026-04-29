import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(currentDir, '..');
const packageIndexPath = resolve(currentDir, 'index.ts');

function readPackageJson(): { exports?: Record<string, string | Record<string, string>> } {
  const raw = readFileSync(resolve(packageRoot, 'package.json'), 'utf8');
  return JSON.parse(raw) as { exports?: Record<string, string | Record<string, string>> };
}

function assertNoPublicSubpathLeakage(
  exportsField: Record<string, string | Record<string, string>>
): void {
  const exportKeys = Object.keys(exportsField);
  expect(exportKeys).toEqual(['.']);

  for (const [key, value] of Object.entries(exportsField)) {
    expect(key).toBe('.');

    const target = typeof value === 'string' ? value : value.import;
    expect(target).toBe('./src/index.ts');
  }
}

describe('@auftakt/runtime public api contract', () => {
  it('does not leak internal modules via package exports', () => {
    const pkg = readPackageJson();
    expect(pkg.exports).toBeDefined();
    assertNoPublicSubpathLeakage(pkg.exports!);
  });

  it('exposes only generic runtime execution values from the package root', async () => {
    const mod = await import('@auftakt/runtime');
    const exportNames = Object.keys(mod);
    const source = readFileSync(packageIndexPath, 'utf8');

    expect(exportNames).toEqual(
      expect.arrayContaining([
        'AUFTAKT_RUNTIME_PLUGIN_API_VERSION',
        'REPAIR_REQUEST_COALESCING_SCOPE',
        'buildRequestExecutionPlan',
        'buildRelaySetSnapshot',
        'cacheEvent',
        'calculateRelayReconnectDelay',
        'createAuftaktRuntimeCoordinator',
        'createBackwardReq',
        'createEventCoordinator',
        'createForwardReq',
        'createHotEventIndex',
        'createMaterializerQueue',
        'createRegistryBackedSessionRuntime',
        'createRelayGateway',
        'createRelaySession',
        'createRxBackwardReq',
        'createRxForwardReq',
        'createRxNostrSession',
        'fetchEventById',
        'fetchFollowGraph',
        'fetchLatestEventsForKinds',
        'fetchReplaceableEventsByAuthorsAndKind',
        'loadEventSubscriptionDeps',
        'mergeTimelineEvents',
        'nip07Signer',
        'normalizeRelayCapabilitySnapshot',
        'normalizeRelayLifecycleOptions',
        'normalizeRelayObservation',
        'normalizeRelayObservationPacket',
        'normalizeRelayObservationSnapshot',
        'observeRelayStatuses',
        'paginateTimelineWindow',
        'registerRuntimePlugin',
        'snapshotRelayStatuses',
        'sortTimelineByCreatedAtDesc',
        'startBackfillAndLiveSubscription',
        'startDeletionReconcile',
        'startMergedLiveSubscription',
        'subscribeDualFilterStreams',
        'uniq'
      ])
    );
    expect(source).not.toMatch(/Resonote/i);
    expect(source).not.toMatch(/COMMENTS_FLOW/);
    expect(source).not.toMatch(/CONTENT_RESOLUTION_FLOW/);
    expect(source).not.toMatch(/RESONOTE_PLAY_POSITION_SORT/);
    expect(source).not.toMatch(/\bNEG-[A-Z]+\b/);
    expect(source).not.toMatch(/\bNegentropyRequestOptions\b/);
    expect(source).not.toMatch(/\bRxNostr\b/);
  });

  it('does not expose resonote-specific or negentropy names from the package root', async () => {
    const mod = await import('@auftakt/runtime');
    const exportNames = Object.keys(mod);

    for (const name of exportNames) {
      expect(name).not.toMatch(/Resonote/i);
      expect(name).not.toMatch(/COMMENTS_FLOW/);
      expect(name).not.toMatch(/CONTENT_RESOLUTION_FLOW/);
      expect(name).not.toMatch(/RESONOTE_PLAY_POSITION_SORT/);
      expect(name).not.toMatch(/^NEG-/);
    }
  });
});
