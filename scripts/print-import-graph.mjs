import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = 'src';
const SOURCE_FILE = /\.(ts|svelte)$/;
const TEST_FILE = /\.(test|spec)\.(ts|js|svelte)$/;

const format = process.argv.includes('--summary') ? 'summary' : 'dot';

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
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function collectSpecifiers(source) {
  const stripped = stripComments(source);
  const specifiers = new Set();

  for (const match of stripped.matchAll(/^\s*(?:import|export)\s.+?\sfrom\s+['"]([^'"]+)['"]/gm)) {
    specifiers.add(match[1]);
  }

  for (const match of stripped.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    specifiers.add(match[1]);
  }

  return [...specifiers].sort();
}

function bucketFromFile(file) {
  const normalized = file.split(sep).join('/');
  if (normalized.startsWith('src/shared/')) return 'shared';
  if (normalized.startsWith('src/features/')) return 'features';
  if (normalized.startsWith('src/app/')) return 'app';
  if (normalized.startsWith('src/web/routes/')) return 'routes';
  if (normalized.startsWith('src/lib/components/')) return 'lib-components';
  if (normalized.startsWith('src/lib/')) return 'lib-other';
  if (normalized.startsWith('src/extension/')) return 'extension';
  if (normalized.startsWith('src/architecture/')) return 'architecture';
  return 'other';
}

function bucketFromSpecifier(specifier) {
  if (specifier.startsWith('$shared/')) return 'shared';
  if (specifier.startsWith('$features/')) return 'features';
  if (specifier.startsWith('$appcore/')) return 'app';
  if (specifier.startsWith('$lib/components/')) return 'lib-components';
  if (specifier.startsWith('$lib/')) return 'lib-other';
  if (specifier.startsWith('$app/')) return 'sveltekit-app';
  if (specifier.startsWith('.')) return 'relative';
  return 'external';
}

const files = walk(ROOT);
const nodes = new Set();
const edges = new Map();

for (const file of files) {
  const from = bucketFromFile(relative('.', file));
  nodes.add(from);

  const source = readFileSync(file, 'utf8');
  for (const specifier of collectSpecifiers(source)) {
    const to = bucketFromSpecifier(specifier);
    nodes.add(to);
    const key = `${from}->${to}`;
    edges.set(key, (edges.get(key) ?? 0) + 1);
  }
}

if (format === 'summary') {
  const sortedEdges = [...edges.entries()].sort(([a], [b]) => a.localeCompare(b));
  for (const [key, count] of sortedEdges) {
    const [from, to] = key.split('->');
    console.log(`${from} -> ${to}: ${count}`);
  }
  process.exit(0);
}

console.log('digraph ResonoteImports {');
console.log('  rankdir=LR;');
for (const node of [...nodes].sort()) {
  console.log(`  "${node}";`);
}
for (const [key, count] of [...edges.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  const [from, to] = key.split('->');
  console.log(`  "${from}" -> "${to}" [label="${count}"];`);
}
console.log('}');
