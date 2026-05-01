import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, '../../..');

const trackedGuardFilePattern = /\.(?:ts|tsx|svelte|md|json|mjs|js)$/;
const guardedPathPrefixes = ['packages/runtime/src/'];
const excludedPathSegments = [
  '/.sisyphus/evidence/',
  '/.svelte-kit/',
  '/build/',
  '/.wrangler/',
  '/dist-extension/',
  '/node_modules/'
];

const parts = {
  lower: ['r', 'x'].join(''),
  camelLower: ['R', 'x'].join(''),
  upper: ['R', 'x'].join(''),
  lowerCreate: ['c', 'r', 'e', 'a', 't', 'e'].join(''),
  upperCreate: ['C', 'r', 'e', 'a', 't', 'e'].join(''),
  lowerGet: ['g', 'e', 't'].join(''),
  upperGet: ['G', 'e', 't'].join(''),
  lowerNostr: ['n', 'o', 's', 't', 'r'].join(''),
  upperNostr: ['N', 'o', 's', 't', 'r'].join(''),
  backward: ['B', 'a', 'c', 'k', 'w', 'a', 'r', 'd'].join(''),
  forward: ['F', 'o', 'r', 'w', 'a', 'r', 'd'].join(''),
  req: ['R', 'e', 'q'].join(''),
  hyphen: ['-'].join(''),
  retired: ['o', 'b', 's', 'o', 'l', 'e', 't', 'e'].join(''),
  interop: ['c', 'o', 'm', 'p', 'a', 't'].join('')
};

const blockedWords = [
  [parts.lower, parts.hyphen, parts.lowerNostr].join(''),
  [parts.upper, parts.upperNostr].join(''),
  [parts.lower, parts.upperNostr].join(''),
  [parts.camelLower, parts.upperNostr].join(''),
  [parts.upperCreate, parts.upper, parts.upperNostr].join(''),
  [parts.lowerCreate, parts.upper, parts.upperNostr].join(''),
  [parts.lowerGet, parts.upper, parts.upperNostr].join(''),
  [parts.lowerCreate, parts.upper, parts.backward, parts.req].join(''),
  [parts.lowerCreate, parts.upper, parts.forward, parts.req].join(''),
  [parts.upper, parts.backward, parts.req].join(''),
  [parts.upper, parts.forward, parts.req].join(''),
  parts.retired,
  parts.interop
];

function trackedGuardFiles(): string[] {
  const raw = execFileSync('git', ['ls-files'], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  return raw
    .split(/\r?\n/)
    .map((path) => path.trim())
    .filter(
      (path) =>
        path.length > 0 &&
        trackedGuardFilePattern.test(path) &&
        guardedPathPrefixes.some((prefix) => path.startsWith(prefix)) &&
        excludedPathSegments.every((segment) => !path.includes(segment))
    );
}

function findMatches(paths: readonly string[]): { path: string; word: string }[] {
  const hits: { path: string; word: string }[] = [];

  for (const path of paths) {
    if (blockedWords.some((word) => path.includes(word))) {
      for (const word of blockedWords) {
        if (path.includes(word)) hits.push({ path, word });
      }
    }
  }

  return hits;
}

function findContentMatches(paths: readonly string[]): { path: string; word: string }[] {
  const hits: { path: string; word: string }[] = [];

  for (const path of paths) {
    const content = readFileSync(resolve(repoRoot, path), 'utf8');

    for (const word of blockedWords) {
      if (content.includes(word)) {
        hits.push({ path, word });
      }
    }
  }

  return hits;
}

describe('@auftakt/runtime relay session word guard', () => {
  it('rejects disallowed relay session words in tracked package paths and content', () => {
    const paths = trackedGuardFiles();
    const pathHits = findMatches(paths);
    const contentHits = findContentMatches(paths);

    expect(pathHits).toEqual([]);
    expect(contentHits).toEqual([]);
  });

  it('excludes evidence and generated caches from the tracked scan set', () => {
    const paths = trackedGuardFiles();

    expect(paths.every((path) => trackedGuardFilePattern.test(path))).toBe(true);
    expect(
      paths.every((path) => guardedPathPrefixes.some((prefix) => path.startsWith(prefix)))
    ).toBe(true);
    for (const segment of excludedPathSegments) {
      expect(paths.some((path) => path.includes(segment))).toBe(false);
    }
  });
});
