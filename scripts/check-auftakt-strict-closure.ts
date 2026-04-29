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
  'docs/archive/',
  'docs/superpowers/',
  'node_modules/',
  'scripts/check-auftakt-strict-closure'
];
const LEGACY_ADAPTER_SLUG = 'adapter-' + 'indexeddb';
const LEGACY_ADAPTER_PACKAGE = `@auftakt/${LEGACY_ADAPTER_SLUG}`;
const LEGACY_ADAPTER_PATH = `packages/${LEGACY_ADAPTER_SLUG}`;
const REMOVED_RELAY_ADAPTER_SLUG = 'adapter-' + 'relay';
const REMOVED_PACKAGE_PATTERNS = [
  `@auftakt/${REMOVED_RELAY_ADAPTER_SLUG}`,
  LEGACY_ADAPTER_PACKAGE,
  `packages/${REMOVED_RELAY_ADAPTER_SLUG}`,
  LEGACY_ADAPTER_PATH
];
const ACTIVE_DOC_PATHS = new Set(['README.md', 'CLAUDE.md']);
const RETIRED_CACHED_READ_BASENAME = 'cached-' + 'query';
const RETIRED_CACHED_READ_PATHS = new Set([
  `src/shared/nostr/${RETIRED_CACHED_READ_BASENAME}.svelte.ts`,
  `src/shared/nostr/${RETIRED_CACHED_READ_BASENAME}.ts`
]);
const RETIRED_CACHED_READ_SPECIFIERS = [
  `$shared/nostr/${RETIRED_CACHED_READ_BASENAME}.js`,
  `$shared/nostr/${RETIRED_CACHED_READ_BASENAME}.svelte.js`,
  `./${RETIRED_CACHED_READ_BASENAME}.js`,
  `./${RETIRED_CACHED_READ_BASENAME}.svelte.js`
];
const APRIL_COMPLETION_AUDIT_PATH = 'docs/auftakt/2026-04-26-april-doc-completion-audit.md';
const STATUS_VERIFICATION_PATH = 'docs/auftakt/status-verification.md';
const LEGACY_STRICT_REDESIGN_AUDIT_PATH =
  'docs/auftakt/2026-04-24-strict-redesign-integrated-audit.md';
const CURRENT_STRICT_GOAL_AUDIT_PATH = 'docs/auftakt/2026-04-26-strict-goal-gap-audit.md';
const STALE_APRIL_COMPLETION_AUDIT_MARKERS = [
  {
    marker: 'Not complete until `pnpm run check:auftakt-complete` passes',
    message: `${APRIL_COMPLETION_AUDIT_PATH} still claims completion is blocked after the completion gate passed`
  },
  {
    marker:
      '| `docs/superpowers/specs/2026-04-25-cached-query-retirement-design.md`                                       | Partially Implemented',
    message: `${APRIL_COMPLETION_AUDIT_PATH} still marks cached-query retirement design as Partially Implemented`
  },
  {
    marker:
      '| `docs/superpowers/plans/2026-04-25-auftakt-relay-capability-strict-completion.md`                           | Partially Implemented',
    message: `${APRIL_COMPLETION_AUDIT_PATH} still marks relay capability strict completion as Partially Implemented`
  },
  {
    marker:
      '| `docs/superpowers/plans/2026-04-25-cached-query-retirement.md`                                              | Partially Implemented',
    message: `${APRIL_COMPLETION_AUDIT_PATH} still marks cached-query retirement plan as Partially Implemented`
  },
  {
    marker: 'Complete Tasks 1 and 2, then reclassify as `Implemented`',
    message: `${APRIL_COMPLETION_AUDIT_PATH} still asks to complete cached-query retirement tasks`
  },
  {
    marker: 'Complete Task 1, then reclassify as `Implemented`',
    message: `${APRIL_COMPLETION_AUDIT_PATH} still asks to complete relay capability strict completion tasks`
  },
  {
    marker: 'Run this after the implementation tasks:',
    message: `${APRIL_COMPLETION_AUDIT_PATH} still describes final verification as pending`
  }
];
const LEGACY_STRICT_AUDIT_HISTORICAL_MARKER =
  'Historical baseline. Current strict goal status and guard truth live in';

function addUnique(errors: string[], message: string): void {
  if (!errors.includes(message)) {
    errors.push(message);
  }
}

function isIgnoredStrictClosurePath(path: string): boolean {
  return IGNORED_PATH_PARTS.some((part) => path.includes(part));
}

function isProductionResonoteSource(path: string): boolean {
  return (
    path.startsWith('packages/resonote/src/') &&
    !path.endsWith('.test.ts') &&
    !path.endsWith('.contract.test.ts')
  );
}

function isProductionSharedNostrSource(path: string): boolean {
  return (
    path.startsWith('src/shared/nostr/') &&
    !path.endsWith('.test.ts') &&
    !path.endsWith('.contract.test.ts')
  );
}

export function checkStrictClosure(files: readonly StrictClosureFile[]): StrictClosureResult {
  const errors: string[] = [];

  for (const file of files) {
    if (isIgnoredStrictClosurePath(file.path)) continue;

    if (file.path.startsWith(`${LEGACY_ADAPTER_PATH}/`)) {
      addUnique(errors, `${LEGACY_ADAPTER_PATH} exists`);
      continue;
    }
    if (RETIRED_CACHED_READ_PATHS.has(file.path)) {
      errors.push(`${file.path} is retired; use $shared/auftakt/resonote.js for cached reads`);
    }
    if (RETIRED_CACHED_READ_SPECIFIERS.some((specifier) => file.text.includes(specifier))) {
      errors.push(`${file.path} imports retired shared Nostr cached read bridge`);
    }
    if (file.text.includes(LEGACY_ADAPTER_PACKAGE)) {
      errors.push(`${file.path} imports ${LEGACY_ADAPTER_PACKAGE}`);
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
    if (
      isProductionResonoteSource(file.path) &&
      /toStoredEvent\(\s*packet\.event\s*\)/.test(file.text)
    ) {
      errors.push(`${file.path} converts raw packet.event without ingress`);
    }
    if (
      isProductionSharedNostrSource(file.path) &&
      (/events\.push\(\s*packet\.event/.test(file.text) ||
        /callbacks\.next\?\.\(\s*\{\s*event:\s*packet\.event/.test(file.text))
    ) {
      errors.push(`${file.path} exposes raw packet.event outside coordinator facade`);
    }
    if (
      isProductionSharedNostrSource(file.path) &&
      /packages\/resonote\/src\/runtime\.js/.test(file.text)
    ) {
      errors.push(
        `${file.path} imports package runtime internals instead of the coordinator facade`
      );
    }
    if (
      file.path === 'packages/runtime/src/relay-gateway.ts' &&
      file.text
        .split(/\r?\n/)
        .some((line) => /\breturn\s+\{[^\n}]*(?:\{|,)\s*events\s*(?::|,|\})/.test(line))
    ) {
      errors.push(`${file.path} returns relay gateway events instead of candidates`);
    }
    if (
      ACTIVE_DOC_PATHS.has(file.path) &&
      REMOVED_PACKAGE_PATTERNS.some((pattern) => file.text.includes(pattern))
    ) {
      errors.push(`${file.path} mentions removed Auftakt package boundary`);
    }
    if (file.path === APRIL_COMPLETION_AUDIT_PATH) {
      for (const staleMarker of STALE_APRIL_COMPLETION_AUDIT_MARKERS) {
        if (file.text.includes(staleMarker.marker)) {
          addUnique(errors, staleMarker.message);
        }
      }
    }
    if (file.path === STATUS_VERIFICATION_PATH) {
      if (file.text.includes(LEGACY_STRICT_REDESIGN_AUDIT_PATH)) {
        errors.push(
          `${STATUS_VERIFICATION_PATH} points strict audit readers at the superseded 2026-04-24 audit`
        );
      }
      if (!file.text.includes(CURRENT_STRICT_GOAL_AUDIT_PATH)) {
        errors.push(`${STATUS_VERIFICATION_PATH} must link the current strict goal audit`);
      }
    }
    if (
      file.path === LEGACY_STRICT_REDESIGN_AUDIT_PATH &&
      (!file.text.includes(LEGACY_STRICT_AUDIT_HISTORICAL_MARKER) ||
        !file.text.includes(CURRENT_STRICT_GOAL_AUDIT_PATH))
    ) {
      errors.push(
        `${LEGACY_STRICT_REDESIGN_AUDIT_PATH} must be marked as a historical baseline linked to the current strict goal audit`
      );
    }
    if (file.path === 'src/shared/nostr/pending-publishes.ts' && file.text.includes("from 'idb'")) {
      errors.push('src/shared/nostr/pending-publishes.ts still uses standalone idb storage');
    }
  }

  const runtimeProductionFiles = files.filter(
    (file) =>
      isProductionResonoteSource(file.path) ||
      (file.path.startsWith('packages/runtime/src/') &&
        !file.path.endsWith('.test.ts') &&
        !file.path.endsWith('.contract.test.ts'))
  );
  const queueReferenced = runtimeProductionFiles.some(
    (file) =>
      file.path !== 'packages/runtime/src/materializer-queue.ts' &&
      file.text.includes('createMaterializerQueue')
  );
  const gatewayReferenced = runtimeProductionFiles.some(
    (file) =>
      file.path !== 'packages/runtime/src/relay-gateway.ts' &&
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
    .filter((path) => !isIgnoredStrictClosurePath(path))
    .map((path) => ({ path, text: readFileSync(join(root, path), 'utf8') }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const files = collectFiles();
  if (existsSync(LEGACY_ADAPTER_PATH)) {
    files.push({ path: `${LEGACY_ADAPTER_PATH}/src/index.ts`, text: '' });
  }
  const result = checkStrictClosure(files);
  if (!result.ok) {
    console.error(result.errors.join('\n'));
    process.exit(1);
  }
}
