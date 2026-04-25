import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(currentDir, '..');

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
        buildRequestExecutionPlan: expect.any(Function),
        calculateRelayReconnectDelay: expect.any(Function),
        createRuntimeRequestKey: expect.any(Function),
        createRxNostrSession: expect.any(Function),
        filterNegentropyEventRefs: expect.any(Function),
        normalizeRelayLifecycleOptions: expect.any(Function),
        reconcileReplayRepairSubjects: expect.any(Function),
        reduceReadSettlement: expect.any(Function),
        validateRelayEvent: expect.any(Function)
      })
    );
  });
});
