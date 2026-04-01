import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = 'src';
const SOURCE_FILE = /\.(ts|svelte)$/;
const TEST_FILE = /\.(test|spec)\.(ts|js|svelte)$/;

const bannedImportPatterns: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /^\$lib\/stores\/.+\.svelte\.js$/,
    reason: 'Use $shared/browser public owners instead of legacy $lib/stores.'
  },
  {
    pattern: /^\.{1,2}(?:\/[^'"]+)*\/stores\/.+\.svelte\.js$/,
    reason: 'Component-relative store imports are not allowed.'
  },
  {
    pattern: /^\$lib\/i18n\/(?:t|locales)\.js$/,
    reason: 'Use $shared/i18n public APIs instead of legacy $lib/i18n runtime paths.'
  },
  {
    pattern: /^\.{1,2}(?:\/[^'"]+)*\/i18n\/(?:t|locales)\.js$/,
    reason: 'Relative i18n runtime imports are not allowed.'
  },
  {
    pattern: /\$shared\/nostr\/gateway\.js$/,
    reason:
      'gateway.ts was removed. Use $shared/nostr/store.js or $shared/nostr/client.js directly.'
  },
  {
    pattern: /\$shared\/nostr\/event-db\.js$/,
    reason: 'event-db.ts was removed. Use $shared/nostr/store.js (auftakt EventStore).'
  },
  {
    pattern: /\$shared\/nostr\/cached-query(?:\.svelte)?\.js$/,
    reason:
      'cached-query was removed. Use store.fetchById() or fetchLatest() from $shared/nostr/store.js.'
  }
];

function walk(dir: string): string[] {
  const entries = readdirSync(dir).sort();
  const files: string[] = [];

  for (const entry of entries) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...walk(path));
      continue;
    }
    if (!SOURCE_FILE.test(path) || TEST_FILE.test(path)) continue;
    files.push(path);
  }

  return files;
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function collectSpecifiers(source: string): string[] {
  const stripped = stripComments(source);
  const specifiers = new Set<string>();

  for (const match of stripped.matchAll(/^\s*(?:import|export)\s.+?\sfrom\s+['"]([^'"]+)['"]/gm)) {
    specifiers.add(match[1]);
  }

  for (const match of stripped.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    specifiers.add(match[1]);
  }

  return [...specifiers].sort();
}

describe('structure guard', () => {
  const sourceFiles = walk(ROOT);

  it('should not reintroduce legacy store or i18n runtime imports', () => {
    const violations: string[] = [];

    for (const file of sourceFiles) {
      const source = readFileSync(file, 'utf8');
      const specifiers = collectSpecifiers(source);

      for (const specifier of specifiers) {
        for (const { pattern, reason } of bannedImportPatterns) {
          if (pattern.test(specifier)) {
            violations.push(`${file}: ${specifier} — ${reason}`);
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
