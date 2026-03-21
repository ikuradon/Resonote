import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'src';
const SOURCE_FILE = /\.(ts|svelte)$/;
const TEST_FILE = /\.(test|spec)\.(ts|js|svelte)$/;

const bannedImportPatterns = [
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
  }
];

function walk(dir) {
  const entries = readdirSync(dir).sort();
  const files = [];

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

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

function collectSpecifiers(source) {
  const stripped = stripComments(source);
  const specifiers = new Set();

  for (const match of stripped.matchAll(
    /^\s*(?:import|export)\s.+?\sfrom\s+['"]([^'"]+)['"]/gm
  )) {
    specifiers.add(match[1]);
  }

  for (const match of stripped.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    specifiers.add(match[1]);
  }

  return [...specifiers].sort();
}

const violations = [];
for (const file of walk(ROOT)) {
  const source = readFileSync(file, 'utf8');
  for (const specifier of collectSpecifiers(source)) {
    for (const { pattern, reason } of bannedImportPatterns) {
      if (pattern.test(specifier)) {
        violations.push(`${file}: ${specifier} — ${reason}`);
      }
    }
  }
}

if (violations.length > 0) {
  console.error('Structure check failed:\n');
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log('Structure check passed.');
