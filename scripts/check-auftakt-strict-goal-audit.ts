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
const CANONICAL_SPEC_PATH = 'docs/auftakt/spec.md';

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

const REQUIRED_PUBLISH_SETTLEMENT_AUDIT_EVIDENCE =
  'Publish settlement now has core vocabulary and coordinator-owned local materialization, relay hint, and pending queue proof.';

const REQUIRED_PUBLISH_SETTLEMENT_FILES = [
  {
    path: 'packages/core/src/settlement.ts',
    text: 'reducePublishSettlement',
    description: 'core publish settlement reducer'
  },
  {
    path: 'packages/resonote/src/event-coordinator.ts',
    text: 'settlement: reducePublishSettlement',
    description: 'coordinator publish settlement return'
  }
];

const REQUIRED_SYNC_CURSOR_REPAIR_AUDIT_EVIDENCE =
  'Sync cursor incremental repair now persists Dexie ordered cursors and bounds fallback and negentropy repair through coordinator-owned runtime repair.';

const REQUIRED_SYNC_CURSOR_REPAIR_FILES = [
  {
    path: 'packages/adapter-dexie/src/index.ts',
    text: 'putSyncCursor',
    description: 'Dexie sync cursor writer'
  },
  {
    path: 'packages/resonote/src/runtime.ts',
    text: 'loadRepairSyncCursor',
    description: 'runtime sync cursor load'
  },
  {
    path: 'packages/resonote/src/relay-repair.contract.test.ts',
    text: 'resumes fallback repair from a persisted cursor after runtime recreation',
    description: 'restart-safe repair cursor contract'
  }
];

const REQUIRED_ORDINARY_READ_CAPABILITY_AUDIT_EVIDENCE =
  'Ordinary read capability verification now routes latest and backward coordinator reads through negentropy-first RelayGateway verification with REQ fallback.';

const REQUIRED_ORDINARY_READ_CAPABILITY_FILES = [
  {
    path: 'packages/resonote/src/runtime.ts',
    text: 'createOrdinaryReadRelayGateway',
    description: 'ordinary read relay gateway helper'
  },
  {
    path: 'packages/resonote/src/runtime.ts',
    text: 'verifyOrdinaryReadRelayCandidates',
    description: 'ordinary read coordinator gateway verifier'
  },
  {
    path: 'packages/resonote/src/public-read-cutover.contract.test.ts',
    text: 'attempts negentropy before ordinary latest REQ verification',
    description: 'latest ordinary read negentropy contract'
  },
  {
    path: 'packages/resonote/src/public-read-cutover.contract.test.ts',
    text: 'uses capability-aware gateway for backward event reads',
    description: 'backward ordinary read gateway contract'
  }
];

const REQUIRED_BROADER_OUTBOX_AUDIT_EVIDENCE =
  'Broader outbox routing now uses coordinator-selected author, audience, explicit addressable, and durable addressable relay candidates while default-only suppresses broader candidates.';

const REQUIRED_BROADER_OUTBOX_FILES = [
  {
    path: 'packages/resonote/src/relay-selection-runtime.ts',
    text: 'addressableTargetCandidates',
    description: 'addressable target candidate collector'
  },
  {
    path: 'packages/resonote/src/relay-selection-runtime.ts',
    text: 'collectAddressableTagReferences',
    description: 'addressable tag parser'
  },
  {
    path: 'packages/resonote/src/relay-selection-runtime.contract.test.ts',
    text: 'builds publish options from addressable explicit relay hints',
    description: 'addressable explicit relay selection contract'
  },
  {
    path: 'packages/resonote/src/relay-selection-runtime.contract.test.ts',
    text: 'builds publish options from durable hints for local addressable targets',
    description: 'addressable durable relay selection contract'
  },
  {
    path: 'packages/resonote/src/relay-selection-runtime.contract.test.ts',
    text: 'default-only policy suppresses broader outbox publish candidates',
    description: 'default-only broader outbox suppression contract'
  },
  {
    path: 'packages/resonote/src/relay-selection-runtime.contract.test.ts',
    text: 'ignores malformed addressable tags and invalid addressable relay hints',
    description: 'malformed addressable tag suppression contract'
  },
  {
    path: 'packages/resonote/src/relay-routing-publish.contract.test.ts',
    text: 'passes selected relays to reaction publish transport',
    description: 'reaction publish coordinator routing contract'
  },
  {
    path: 'packages/resonote/src/relay-routing-publish.contract.test.ts',
    text: 'passes selected audience relays to mention publish transport',
    description: 'mention publish coordinator routing contract'
  },
  {
    path: 'packages/resonote/src/relay-routing-publish.contract.test.ts',
    text: 'passes addressable explicit relay hints to publish transport',
    description: 'addressable explicit coordinator routing contract'
  },
  {
    path: 'packages/resonote/src/relay-routing-publish.contract.test.ts',
    text: 'passes durable addressable target hints to publish transport',
    description: 'addressable durable coordinator routing contract'
  }
];

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

function findFileText(files: readonly StrictGoalAuditFile[], path: string): string | null {
  return files.find((file) => file.path === path)?.text ?? null;
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

function checkCanonicalSpecWording(errors: string[], files: readonly StrictGoalAuditFile[]): void {
  const spec = files.find((file) => file.path === CANONICAL_SPEC_PATH);
  if (!spec) return;
  if (!spec.text.includes('### 14.3')) return;
  if (spec.text.includes(STRICT_GOAL_AUDIT_PATH)) return;

  errors.push(
    `${CANONICAL_SPEC_PATH} must reference ${STRICT_GOAL_AUDIT_PATH} when presenting Auftakt goal verdicts`
  );
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

  if (!strictAudit.text.includes(REQUIRED_PUBLISH_SETTLEMENT_AUDIT_EVIDENCE)) {
    errors.push(
      `${strictAudit.path} is missing coordinator-owned publish settlement implementation evidence`
    );
  }

  if (!strictAudit.text.includes(REQUIRED_SYNC_CURSOR_REPAIR_AUDIT_EVIDENCE)) {
    errors.push(
      `${strictAudit.path} is missing sync cursor incremental repair implementation evidence`
    );
  }

  if (!strictAudit.text.includes(REQUIRED_ORDINARY_READ_CAPABILITY_AUDIT_EVIDENCE)) {
    errors.push(
      `${strictAudit.path} is missing ordinary read capability verification implementation evidence`
    );
  }

  if (!strictAudit.text.includes(REQUIRED_BROADER_OUTBOX_AUDIT_EVIDENCE)) {
    errors.push(`${strictAudit.path} is missing broader outbox routing implementation evidence`);
  }

  for (const required of REQUIRED_PUBLISH_SETTLEMENT_FILES) {
    const text = findFileText(files, required.path);
    if (text === null) {
      errors.push(`${required.path} is missing for strict publish settlement audit`);
      continue;
    }
    if (!text.includes(required.text)) {
      errors.push(`${required.path} is missing ${required.description}: ${required.text}`);
    }
  }

  for (const required of REQUIRED_SYNC_CURSOR_REPAIR_FILES) {
    const text = findFileText(files, required.path);
    if (text === null) {
      errors.push(`${required.path} is missing for strict sync cursor repair audit`);
      continue;
    }
    if (!text.includes(required.text)) {
      errors.push(`${required.path} is missing ${required.description}: ${required.text}`);
    }
  }

  for (const required of REQUIRED_ORDINARY_READ_CAPABILITY_FILES) {
    const text = findFileText(files, required.path);
    if (text === null) {
      errors.push(`${required.path} is missing for strict ordinary read capability audit`);
      continue;
    }
    if (!text.includes(required.text)) {
      errors.push(`${required.path} is missing ${required.description}: ${required.text}`);
    }
  }

  for (const required of REQUIRED_BROADER_OUTBOX_FILES) {
    const text = findFileText(files, required.path);
    if (text === null) {
      errors.push(`${required.path} is missing for strict broader outbox routing audit`);
      continue;
    }
    if (!text.includes(required.text)) {
      errors.push(`${required.path} is missing ${required.description}: ${required.text}`);
    }
  }

  if (AMBIGUOUS_STRICT_COMPLETION_PATTERNS.some((pattern) => pattern.test(strictAudit.text))) {
    errors.push(
      `${strictAudit.path} claims strict final completion without preserving scoped-vs-strict distinction`
    );
  }

  checkCanonicalSpecWording(errors, files);
  checkRawTransportMediation(errors, files);

  return { ok: errors.length === 0, errors };
}

function collectFiles(root = process.cwd()): StrictGoalAuditFile[] {
  const paths = [
    STRICT_GOAL_AUDIT_PATH,
    'docs/auftakt/spec.md',
    'packages/core/src/settlement.ts',
    'packages/resonote/src/event-coordinator.ts',
    'packages/adapter-dexie/src/index.ts',
    'packages/resonote/src/runtime.ts',
    'packages/resonote/src/relay-repair.contract.test.ts',
    'packages/resonote/src/public-read-cutover.contract.test.ts',
    'packages/resonote/src/relay-selection-runtime.ts',
    'packages/resonote/src/relay-selection-runtime.contract.test.ts',
    'packages/resonote/src/relay-routing-publish.contract.test.ts'
  ].filter((path) => existsSync(join(root, path)));
  return paths.map((path) => ({ path, text: readFileSync(join(root, path), 'utf8') }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = checkStrictGoalAudit(collectFiles());
  if (!result.ok) {
    console.error(result.errors.join('\n'));
    process.exit(1);
  }
}
