import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, '../../..');

const expectedPackages = ['adapter-dexie', 'core', 'resonote', 'runtime'];
const auftaktPackagePattern = /@auftakt\/(adapter-dexie|core|resonote|runtime)\b/g;

function trackedPackagePaths(): string[] {
  const raw = execFileSync('git', ['ls-files', 'packages/'], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  return raw
    .split(/\r?\n/)
    .map((path) => path.trim())
    .filter((path) => path.length > 0 && !path.includes('node_modules'));
}

function packageNames(paths: readonly string[]): string[] {
  const names = new Set<string>();

  for (const path of paths) {
    const [, packageName, packagePath] = path.split('/');
    if (!packagePath) continue;
    if (packageName) names.add(packageName);
  }

  return [...names].sort();
}

function productionSourcePaths(paths: readonly string[], packageName: string): string[] {
  return paths.filter(
    (path) =>
      path.startsWith(`packages/${packageName}/src/`) &&
      path.endsWith('.ts') &&
      !path.endsWith('.test.ts') &&
      !path.endsWith('.contract.test.ts')
  );
}

function auftaktImports(path: string): string[] {
  const content = readFileSync(resolve(repoRoot, path), 'utf8');
  const imports = new Set<string>();

  for (const match of content.matchAll(auftaktPackagePattern)) {
    imports.add(match[1]);
  }

  return [...imports].sort();
}

function disallowedImports(
  paths: readonly string[],
  disallowedPackages: readonly string[]
): { path: string; imports: string[] }[] {
  const disallowed = new Set(disallowedPackages);
  const hits: { path: string; imports: string[] }[] = [];

  for (const path of paths) {
    const imports = auftaktImports(path).filter((packageName) => disallowed.has(packageName));
    if (imports.length > 0) hits.push({ path, imports });
  }

  return hits;
}

function nonCoreAdapterImports(paths: readonly string[]): { path: string; imports: string[] }[] {
  const hits: { path: string; imports: string[] }[] = [];

  for (const path of paths) {
    const imports = auftaktImports(path).filter((packageName) => packageName !== 'core');
    if (imports.length > 0) hits.push({ path, imports });
  }

  return hits;
}

describe('@auftakt package boundary guard', () => {
  it('keeps the tracked package inventory explicit', () => {
    expect(packageNames(trackedPackagePaths())).toEqual(expectedPackages);
  });

  it('keeps production package imports flowing core <- runtime <- resonote', () => {
    const paths = trackedPackagePaths();

    expect(
      disallowedImports(productionSourcePaths(paths, 'runtime'), ['resonote', 'adapter-dexie'])
    ).toEqual([]);

    expect(
      disallowedImports(productionSourcePaths(paths, 'core'), [
        'runtime',
        'resonote',
        'adapter-dexie'
      ])
    ).toEqual([]);

    expect(nonCoreAdapterImports(productionSourcePaths(paths, 'adapter-dexie'))).toEqual([]);
  });
});
