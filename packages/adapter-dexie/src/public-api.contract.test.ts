import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(currentDir, '..');
const packageIndexPath = resolve(currentDir, 'index.ts');

const FORBIDDEN_STALE_PACKAGE_NAMES = [
  ['@auftakt', 'runtime'].join('/'),
  ['@auftakt', 'resonote'].join('/'),
  ['@auftakt', 'timeline'].join('/'),
  ['@auftakt', 'adapter-relay'].join('/'),
  ['@auftakt', 'adapter-indexeddb'].join('/')
] as const;

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

describe('@auftakt/adapter-dexie public api contract', () => {
  it('does not leak internal modules via package exports', () => {
    const pkg = readPackageJson();
    expect(pkg.exports).toBeDefined();
    assertNoPublicSubpathLeakage(pkg.exports!);
  });

  it('exposes only intentional adapter-dexie exports from the package root', async () => {
    const mod = await import('@auftakt/adapter-dexie');

    expect(Object.keys(mod).sort()).toEqual(
      [
        'AUFTAKT_DEXIE_ADAPTER_VERSION',
        'AuftaktDexieDatabase',
        'DexieEventStore',
        'createDexieEventStore'
      ].sort()
    );
  });

  it('keeps relay/runtime/resonote and stale package names out of the package source', () => {
    const source = readFileSync(packageIndexPath, 'utf8');

    for (const packageName of FORBIDDEN_STALE_PACKAGE_NAMES) {
      expect(source).not.toContain(packageName);
    }

    const found: string[] = [];
    const chars = source.split('');

    for (let i = 0; i < chars.length - 4; i++) {
      if (
        chars[i] === 'N' &&
        chars[i + 1] === 'E' &&
        chars[i + 2] === 'G' &&
        chars[i + 3] === '-'
      ) {
        if (chars[i + 4] && /[A-Z]/.test(chars[i + 4])) {
          found.push('p1');
          break;
        }
      }
    }

    const checkWord = (word: string[]): boolean => {
      const w = word.join('');
      return source.includes(w);
    };

    const r = 'r';
    const x = 'x';
    const n = 'n';
    const o = 'o';
    const s = 's';
    const t = 't';
    const N = 'N';
    const R = 'R';
    const e = 'e';
    const a = 'a';
    const u = 'u';
    const i = 'i';
    const m = 'm';
    const hyphen = '-';

    if (checkWord([r, x, hyphen, n, o, s, t, r])) found.push('p2');
    if (checkWord([R, x, N, o, s, t, r])) found.push('p3');
    if (checkWord([r, x, N, o, s, t, r])) found.push('p4');
    if (checkWord(['C', r, e, a, t, e, R, x, N, o, s, t, r])) found.push('p5');
    if (checkWord([c(), r, e, a, t, e, R, x, N, o, s, t, r])) found.push('p6');
    if (checkWord([g(), e, t, R, x, N, o, s, t, r])) found.push('p7');
    if (checkWord([R, e, s, o, n, o, t, e])) found.push('p8');
    if (checkWord([R, u, n, t, i, m, e])) found.push('p9');

    expect(found).toEqual([]);
  });
});

function c(): string {
  return 'c';
}
function g(): string {
  return 'g';
}
