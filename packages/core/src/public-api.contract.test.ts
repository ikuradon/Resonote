import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(currentDir, '..');

function readPackageJson(): {
  exports?: Record<string, string | Record<string, string>>;
} {
  const raw = readFileSync(resolve(packageRoot, 'package.json'), 'utf8');
  return JSON.parse(raw) as {
    exports?: Record<string, string | Record<string, string>>;
  };
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

describe('@auftakt/core public api contract', () => {
  it('does not leak internal modules via package exports', () => {
    const pkg = readPackageJson();
    expect(pkg.exports).toBeDefined();
    assertNoPublicSubpathLeakage(pkg.exports!);
  });

  it('keeps raw relay internals out of the package root', async () => {
    const mod = await import('@auftakt/core');
    const exportNames = Object.keys(mod);

    const forbidden = [/^getRxNostr$/, /^rawRequest/i, /^relayRequest/i];

    for (const name of exportNames) {
      for (const pattern of forbidden) {
        expect(name).not.toMatch(pattern);
      }
    }
  });

  it('exposes the expected package-root names explicitly', async () => {
    const mod = await import('@auftakt/core');

    expect(mod).toEqual(
      expect.objectContaining({
        buildRelaySelectionPlan: expect.any(Function),
        buildNip51ListEvent: expect.any(Function),
        buildNip59GiftWrap: expect.any(Function),
        buildRequestExecutionPlan: expect.any(Function),
        calculateRelayReconnectDelay: expect.any(Function),
        createRuntimeRequestKey: expect.any(Function),
        createRxNostrSession: expect.any(Function),
        filterNegentropyEventRefs: expect.any(Function),
        getEventHash: expect.any(Function),
        naddrEncode: expect.any(Function),
        neventEncode: expect.any(Function),
        noteEncode: expect.any(Function),
        nprofileEncode: expect.any(Function),
        nrelayEncode: expect.any(Function),
        nsecEncode: expect.any(Function),
        npubEncode: expect.any(Function),
        normalizeRelayLifecycleOptions: expect.any(Function),
        normalizeRelaySelectionPolicy: expect.any(Function),
        normalizeRelayUrl: expect.any(Function),
        parseNip51ListEvent: expect.any(Function),
        parseNip51PrivateTagsJson: expect.any(Function),
        parseNip59RumorJson: expect.any(Function),
        parseNip59SealJson: expect.any(Function),
        parseNip65RelayListTags: expect.any(Function),
        relayListEntriesToSelectionCandidates: expect.any(Function),
        reconcileReplayRepairSubjects: expect.any(Function),
        reduceReadSettlement: expect.any(Function),
        validateRelayEvent: expect.any(Function)
      })
    );
  });
});
