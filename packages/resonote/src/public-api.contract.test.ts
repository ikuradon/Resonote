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

describe('@auftakt/resonote public api contract', () => {
  it('does not leak internal modules via package exports', () => {
    const pkg = readPackageJson();
    expect(pkg.exports).toBeDefined();
    assertNoPublicSubpathLeakage(pkg.exports!);
  });

  it('does not expose raw request-style runtime API names', async () => {
    const mod = await import('@auftakt/resonote');
    const exportNames = Object.keys(mod);

    const forbidden = [
      /^createRxBackwardReq$/,
      /^createRxForwardReq$/,
      /^getRxNostr$/,
      /^useReq/i,
      /^rawRequest/i,
      /^relayRequest/i
    ];

    for (const name of exportNames) {
      for (const pattern of forbidden) {
        expect(name).not.toMatch(pattern);
      }
    }
  });

  it('does not expose raw negentropy protocol names', async () => {
    const mod = await import('@auftakt/resonote');
    const exportNames = Object.keys(mod);

    for (const name of exportNames) {
      expect(name).not.toMatch(/^NEG-(OPEN|MSG|CLOSE)$/);
      expect(name).not.toMatch(/^neg(Open|Msg|Close)$/);
    }
  });

  it('does not expose internal repair-facing runtime symbols from package root', async () => {
    const mod = await import('@auftakt/resonote');
    const exportNames = Object.keys(mod);
    const source = readFileSync(packageIndexPath, 'utf8');

    expect(exportNames).not.toContain('repairEventsFromRelay');
    expect(exportNames).not.toContain('fetchBackwardEvents');
    expect(exportNames).not.toContain('fetchBackwardFirst');
    expect(exportNames).not.toContain('publishSignedEvent');
    expect(source).not.toMatch(/\brepairEventsFromRelay\b/);
    expect(source).not.toMatch(/\bRelayRepairOptions\b/);
    expect(source).not.toMatch(/\bRelayRepairResult\b/);
  });
});
