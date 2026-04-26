import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export interface StrictGoalAuditFile {
  readonly path: string;
  readonly text: string;
}

export interface StrictGoalAuditResult {
  readonly ok: boolean;
  readonly errors: string[];
}

export const STRICT_GOAL_AUDIT_PATH = 'docs/auftakt/2026-04-26-strict-goal-gap-audit.md';

const REQUIRED_AUDIT_SECTIONS = [
  '## Strict Final Goal',
  '## Scoped Completion Baseline',
  '## Classification Model',
  '## Seven Goal Matrix',
  '## Coordinator Mediation Audit',
  '## First Implementation Phase',
  '## Verification'
];

const REQUIRED_CLASSIFICATIONS = ['Satisfied', 'Scoped-Satisfied', 'Partial', 'Missing'];

const REQUIRED_STRICT_GOAL_AREAS = [
  'rx-nostr-like reconnect and REQ optimization',
  'NDK-like API convenience',
  'strfry-like local-first event processing',
  'NIP compliance',
  'Offline incremental and kind:5',
  'Minimal core plus plugin extensions',
  'Single coordinator and database mediation'
];

const REQUIRED_MEDIATION_LAYERS = [
  'app-facing facade',
  'package public API',
  'plugin API',
  'runtime internals',
  'core primitives'
];

const REQUIRED_FIRST_PHASE_NAME = 'strict coordinator audit closure';

const AMBIGUOUS_STRICT_COMPLETION_PATTERNS = [
  /strict final completion is satisfied/i,
  /strict final target is satisfied/i,
  /all strict final goals are satisfied/i
];

const RAW_TRANSPORT_TOKENS = [
  'getRxNostr',
  'createRxBackwardReq',
  'createRxForwardReq',
  'createRxNostrSession',
  'RxNostr'
];

const RAW_PLUGIN_HANDLE_TOKENS = [
  'getRxNostr',
  'getEventsDB',
  'openEventsDb',
  'createRxBackwardReq',
  'createRxForwardReq',
  'materializerQueue',
  'DexieEventStore'
];

const APPROVED_RAW_TRANSPORT_FILES = new Set([
  'packages/core/src/index.ts',
  'packages/core/src/request-planning.ts',
  'packages/core/src/relay-session.ts',
  'packages/resonote/src/runtime.ts',
  'src/shared/auftakt/cached-read.svelte.ts',
  'src/shared/auftakt/resonote.ts',
  'src/shared/nostr/client.ts'
]);

function addUnique(errors: string[], message: string): void {
  if (!errors.includes(message)) errors.push(message);
}

function requireTextIncludes(
  errors: string[],
  path: string,
  text: string,
  required: readonly string[],
  description: string
): void {
  for (const entry of required) {
    if (!text.includes(entry)) {
      addUnique(errors, `${path} is missing required ${description}: ${entry}`);
    }
  }
}

function isProductionSource(path: string): boolean {
  return (
    (path.startsWith('src/') || path.startsWith('packages/')) &&
    /\.(ts|svelte)$/.test(path) &&
    !path.endsWith('.test.ts') &&
    !path.endsWith('.contract.test.ts')
  );
}

function isProductionPluginSource(path: string): boolean {
  return (
    path.startsWith('packages/resonote/src/plugins/') &&
    path.endsWith('.ts') &&
    !path.endsWith('.test.ts') &&
    !path.endsWith('.contract.test.ts')
  );
}

function tokenPattern(token: string): RegExp {
  return new RegExp(`\\b${token}\\b`, 'g');
}

function checkRawTransportMediation(errors: string[], files: readonly StrictGoalAuditFile[]): void {
  for (const file of files) {
    if (!isProductionSource(file.path)) continue;

    if (!APPROVED_RAW_TRANSPORT_FILES.has(file.path)) {
      for (const token of RAW_TRANSPORT_TOKENS) {
        if (tokenPattern(token).test(file.text)) {
          errors.push(
            `${file.path} uses raw transport token ${token} outside an approved coordinator transport zone`
          );
        }
      }
    }

    if (isProductionPluginSource(file.path)) {
      for (const token of RAW_PLUGIN_HANDLE_TOKENS) {
        if (tokenPattern(token).test(file.text)) {
          errors.push(`${file.path} exposes raw plugin handle ${token}`);
        }
      }
    }
  }
}

export function checkStrictGoalAudit(files: readonly StrictGoalAuditFile[]): StrictGoalAuditResult {
  const errors: string[] = [];
  const strictAudit = files.find((file) => file.path === STRICT_GOAL_AUDIT_PATH);

  if (!strictAudit) {
    errors.push(`${STRICT_GOAL_AUDIT_PATH} is missing`);
    return { ok: false, errors };
  }

  requireTextIncludes(
    errors,
    strictAudit.path,
    strictAudit.text,
    REQUIRED_AUDIT_SECTIONS,
    'section'
  );
  requireTextIncludes(
    errors,
    strictAudit.path,
    strictAudit.text,
    REQUIRED_CLASSIFICATIONS,
    'classification'
  );
  requireTextIncludes(
    errors,
    strictAudit.path,
    strictAudit.text,
    REQUIRED_STRICT_GOAL_AREAS,
    'strict goal area'
  );
  requireTextIncludes(
    errors,
    strictAudit.path,
    strictAudit.text,
    REQUIRED_MEDIATION_LAYERS,
    'coordinator mediation layer'
  );

  if (!strictAudit.text.includes(REQUIRED_FIRST_PHASE_NAME)) {
    errors.push(`${strictAudit.path} is missing first implementation phase name`);
  }

  if (AMBIGUOUS_STRICT_COMPLETION_PATTERNS.some((pattern) => pattern.test(strictAudit.text))) {
    errors.push(
      `${strictAudit.path} claims strict final completion without preserving scoped-vs-strict distinction`
    );
  }

  checkRawTransportMediation(errors, files);

  return { ok: errors.length === 0, errors };
}

function collectFiles(root = process.cwd()): StrictGoalAuditFile[] {
  const paths = [STRICT_GOAL_AUDIT_PATH, 'docs/auftakt/spec.md'].filter((path) =>
    existsSync(join(root, path))
  );
  return paths.map((path) => ({ path, text: readFileSync(join(root, path), 'utf8') }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = checkStrictGoalAudit(collectFiles());
  if (!result.ok) {
    console.error(result.errors.join('\n'));
    process.exit(1);
  }
}
