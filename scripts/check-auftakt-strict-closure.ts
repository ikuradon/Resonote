import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export interface StrictClosureFile {
  readonly path: string;
  readonly text: string;
}

export interface StrictClosureResult {
  readonly ok: boolean;
  readonly errors: string[];
}

const ACTIVE_EXTENSIONS = /\.(ts|svelte|json|md|mjs)$/;
const IGNORED_PATH_PARTS = [
  '.codex/',
  '.svelte-kit/',
  '.wrangler/',
  'build/',
  'dist-extension/',
  'docs/superpowers/',
  'node_modules/',
  'scripts/check-auftakt-strict-closure'
];

function addUnique(errors: string[], message: string): void {
  if (!errors.includes(message)) {
    errors.push(message);
  }
}

function isProductionResonoteSource(path: string): boolean {
  return (
    path.startsWith('packages/resonote/src/') &&
    !path.endsWith('.test.ts') &&
    !path.endsWith('.contract.test.ts')
  );
}

export function checkStrictClosure(files: readonly StrictClosureFile[]): StrictClosureResult {
  const errors: string[] = [];

  for (const file of files) {
    if (file.path.startsWith('packages/adapter-indexeddb/')) {
      addUnique(errors, 'packages/adapter-indexeddb exists');
      continue;
    }
    if (file.text.includes('@auftakt/adapter-indexeddb')) {
      errors.push(`${file.path} imports @auftakt/adapter-indexeddb`);
    }
    if (
      isProductionResonoteSource(file.path) &&
      /quarantine:\s*async\s*\(\)\s*=>\s*\{\}/.test(file.text)
    ) {
      errors.push(`${file.path} contains production no-op quarantine writer`);
    }
    if (isProductionResonoteSource(file.path) && /events\.push\(\s*packet\.event/.test(file.text)) {
      errors.push(`${file.path} exposes raw packet.event to public results`);
    }
    if (file.path === 'src/shared/nostr/pending-publishes.ts' && file.text.includes("from 'idb'")) {
      errors.push('src/shared/nostr/pending-publishes.ts still uses standalone idb storage');
    }
  }

  const resonoteProductionFiles = files.filter((file) => isProductionResonoteSource(file.path));
  const queueReferenced = resonoteProductionFiles.some(
    (file) =>
      file.path !== 'packages/resonote/src/materializer-queue.ts' &&
      file.text.includes('createMaterializerQueue')
  );
  const gatewayReferenced = resonoteProductionFiles.some(
    (file) =>
      file.path !== 'packages/resonote/src/relay-gateway.ts' &&
      file.text.includes('createRelayGateway')
  );
  if (!queueReferenced) {
    errors.push('createMaterializerQueue is not referenced by production code');
  }
  if (!gatewayReferenced) {
    errors.push('createRelayGateway is not referenced by production code');
  }

  return { ok: errors.length === 0, errors };
}

function collectFiles(root = process.cwd()): StrictClosureFile[] {
  const input = readFileSync(0, 'utf8').trim();
  const paths = input.length > 0 ? input.split(/\r?\n/) : [];
  return paths
    .filter((path) => ACTIVE_EXTENSIONS.test(path))
    .filter((path) => !IGNORED_PATH_PARTS.some((part) => path.includes(part)))
    .map((path) => ({ path, text: readFileSync(join(root, path), 'utf8') }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const files = collectFiles();
  if (existsSync('packages/adapter-indexeddb')) {
    files.push({ path: 'packages/adapter-indexeddb/src/index.ts', text: '' });
  }
  const result = checkStrictClosure(files);
  if (!result.ok) {
    console.error(result.errors.join('\n'));
    process.exit(1);
  }
}
