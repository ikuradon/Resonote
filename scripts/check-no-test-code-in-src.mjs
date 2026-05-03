import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'src';
const SOURCE_FILE = /\.(ts|svelte)$/;
const TEST_FILE = /\.(test|spec)\.(ts|js|svelte)$/;
const E2E_ONLY_FILE = /\.e2e\.(ts|js)$/;

const forbidden = [
  {
    pattern: /__mockPlayer/,
    reason: 'E2E mock globals must not be referenced from production source.'
  },
  {
    pattern: /__resonoteE2EPlayer/,
    reason: 'E2E-only globals must stay in e2e shims/helpers.'
  },
  {
    pattern: /resonote:e2e/,
    reason: 'E2E-only events must stay outside production source.'
  },
  {
    pattern: /E2E compatibility/i,
    reason: 'Production source must not contain E2E-specific compatibility branches.'
  }
];

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir).sort()) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...walk(path));
      continue;
    }
    if (!SOURCE_FILE.test(path) || TEST_FILE.test(path) || E2E_ONLY_FILE.test(path)) continue;
    files.push(path);
  }
  return files;
}

const violations = [];
for (const file of walk(ROOT)) {
  const content = readFileSync(file, 'utf8');
  for (const { pattern, reason } of forbidden) {
    if (pattern.test(content)) {
      violations.push(`${file}: ${reason}`);
    }
  }
}

if (violations.length > 0) {
  console.error('Production source contains test-only code:\n');
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log('No test-only code found in production source.');
