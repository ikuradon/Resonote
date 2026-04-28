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

const REQUIRED_PLUGIN_MODEL_API_AUDIT_EVIDENCE =
  'Plugin model API now gives extensions coordinator-mediated event, user, addressable, relay-set, and relay-hint handles without exposing raw storage or transport handles.';

const REQUIRED_PLUGIN_MODEL_API_FILES = [
  {
    path: 'packages/resonote/src/runtime.ts',
    text: 'ResonoteCoordinatorPluginModels',
    description: 'plugin model API type'
  },
  {
    path: 'packages/resonote/src/runtime.ts',
    text: 'readonly models: ResonoteCoordinatorPluginModels',
    description: 'plugin model API handle wiring'
  },
  {
    path: 'packages/resonote/src/runtime.ts',
    text: 'createPluginRegistrationApi(pending, entityHandles)',
    description: 'plugin registration model API injection'
  },
  {
    path: 'packages/resonote/src/plugin-api.contract.test.ts',
    text: 'lets plugins register read models backed by coordinator model handles',
    description: 'plugin model API read model contract'
  },
  {
    path: 'packages/resonote/src/plugin-api.contract.test.ts',
    text: 'ResonoteCoordinatorPluginModels',
    description: 'plugin model API package type contract'
  },
  {
    path: 'packages/resonote/src/plugin-isolation.contract.test.ts',
    text: 'getAddressable',
    description: 'plugin model API high-level addressable factory contract'
  },
  {
    path: 'packages/resonote/src/plugin-isolation.contract.test.ts',
    text: 'materializerQueue',
    description: 'plugin model API raw-handle isolation contract'
  }
];

const REQUIRED_STORAGE_HOT_PATH_AUDIT_EVIDENCE =
  'Storage hot-path hardening now proves Dexie kind-bounded traversal, projection reads, max-created lookups, and HotEventIndex kind, tag, replaceable, deletion, and relay-hint paths without broad event-table scans.';

const REQUIRED_LOCAL_STORE_API_AUDIT_EVIDENCE =
  'App-facing local comment, follow graph, and maintenance helpers now call coordinator-owned local store methods without exposing openEventsDb or raw event database handles.';

const REQUIRED_STORAGE_HOT_PATH_FILES = [
  {
    path: 'packages/adapter-dexie/src/hot-path.contract.test.ts',
    text: 'uses kind index for ordered traversal',
    description: 'Dexie kind-bounded ordered traversal contract'
  },
  {
    path: 'packages/adapter-dexie/src/hot-path.contract.test.ts',
    text: 'uses pubkey kind created_at index for author max created_at lookups',
    description: 'Dexie author max-created hot-path contract'
  },
  {
    path: 'packages/adapter-dexie/src/index.ts',
    text: "where('[kind+created_at]')",
    description: 'Dexie kind index traversal implementation'
  },
  {
    path: 'packages/adapter-dexie/src/index.ts',
    text: "where('[pubkey+kind+created_at]')",
    description: 'Dexie author max-created index implementation'
  },
  {
    path: 'packages/adapter-dexie/src/schema.ts',
    text: '[pubkey+kind+created_at]',
    description: 'Dexie author max-created schema index'
  },
  {
    path: 'packages/resonote/src/hot-event-index.contract.test.ts',
    text: 'removes deleted events from all hot indexes',
    description: 'HotEventIndex deletion cleanup contract'
  },
  {
    path: 'packages/resonote/src/hot-event-index.ts',
    text: 'replaceableHeads',
    description: 'HotEventIndex replaceable head implementation'
  },
  {
    path: 'packages/resonote/src/event-coordinator.contract.test.ts',
    text: 'prefills tag reads from hot index while still checking durable store',
    description: 'coordinator tag hot prefill contract'
  }
];

const REQUIRED_LOCAL_STORE_API_FILES = [
  {
    path: 'packages/resonote/src/runtime.ts',
    text: 'readCommentEventsByTag(tagQuery: string): Promise<StoredEvent[]>;',
    description: 'coordinator local comment read API'
  },
  {
    path: 'packages/resonote/src/runtime.ts',
    text: 'clearStoredEvents(): Promise<void>;',
    description: 'coordinator local maintenance API'
  },
  {
    path: 'src/shared/auftakt/resonote.ts',
    text: 'return coordinator.readCommentEventsByTag(tagQuery);',
    description: 'facade local comment read mediation'
  },
  {
    path: 'src/shared/auftakt/resonote.ts',
    text: 'return coordinator.clearStoredEvents();',
    description: 'facade local maintenance mediation'
  },
  {
    path: 'packages/resonote/src/local-store-api.contract.test.ts',
    text: 'keeps raw event database handles out of the public coordinator surface',
    description: 'raw local store handle regression contract'
  }
];

const AMBIGUOUS_STRICT_COMPLETION_PATTERNS = [
  /strict final completion is satisfied/i,
  /strict final target is satisfied/i,
  /all strict final goals are satisfied/i
];

const STALE_STRICT_GOAL_PARTIAL_VERDICTS = [
  {
    pattern: /^\|\s*strfry-like local-first event processing\s*\|\s*`?Partial`?\s*\|/m,
    message: `${STRICT_GOAL_AUDIT_PATH} must not mark strfry-like local-first event processing as Partial after coordinator/local-store proof closure`
  },
  {
    pattern: /^\|\s*Offline incremental and kind:5\s*\|\s*`?Partial`?\s*\|/m,
    message: `${STRICT_GOAL_AUDIT_PATH} must not mark Offline incremental and kind:5 as Partial after sync cursor and kind:5 proof closure`
  }
];

const STALE_STRICT_GOAL_FOLLOWUP_WORDING = [
  {
    pattern:
      /Ordinary reads are not uniformly defined as negentropy-first repair with REQ fallback/,
    message: `${STRICT_GOAL_AUDIT_PATH} must not describe ordinary read negentropy verification as an open follow-up after gateway proof closure`
  }
];

const STALE_CANONICAL_SPEC_PARTIAL_VERDICTS = [
  {
    pattern: /^\|\s*strfry的 local-first seamless processing\s*\|\s*Partial\s*\|/m,
    message:
      'docs/auftakt/spec.md must not mark strfry的 local-first seamless processing as Partial after strict proof closure'
  },
  {
    pattern: /^\|\s*offline incremental \+ kind:5\s*\|\s*Partial\s*\|/m,
    message:
      'docs/auftakt/spec.md must not mark offline incremental + kind:5 as Partial after strict proof closure'
  },
  {
    pattern: /と\s*`Partial`\s*の理由/,
    message:
      'docs/auftakt/spec.md must not describe remaining Partial verdict reasons after strict proof closure'
  },
  {
    pattern: /厳格な ordinary-read negentropy-first 化は strict gap audit で後続候補として扱う/,
    message:
      'docs/auftakt/spec.md must not describe ordinary read negentropy verification as a follow-up after gateway proof closure'
  }
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

  if (!spec.text.includes(STRICT_GOAL_AUDIT_PATH)) {
    errors.push(
      `${CANONICAL_SPEC_PATH} must reference ${STRICT_GOAL_AUDIT_PATH} when presenting Auftakt goal verdicts`
    );
  }

  for (const staleVerdict of STALE_CANONICAL_SPEC_PARTIAL_VERDICTS) {
    if (staleVerdict.pattern.test(spec.text)) {
      errors.push(staleVerdict.message);
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

  if (!strictAudit.text.includes(REQUIRED_PLUGIN_MODEL_API_AUDIT_EVIDENCE)) {
    errors.push(`${strictAudit.path} is missing plugin model API implementation evidence`);
  }

  if (!strictAudit.text.includes(REQUIRED_STORAGE_HOT_PATH_AUDIT_EVIDENCE)) {
    errors.push(
      `${strictAudit.path} is missing storage hot-path hardening implementation evidence`
    );
  }

  if (!strictAudit.text.includes(REQUIRED_LOCAL_STORE_API_AUDIT_EVIDENCE)) {
    errors.push(`${strictAudit.path} is missing coordinator local store API evidence`);
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

  for (const required of REQUIRED_PLUGIN_MODEL_API_FILES) {
    const text = findFileText(files, required.path);
    if (text === null) {
      errors.push(`${required.path} is missing for strict plugin model API audit`);
      continue;
    }
    if (!text.includes(required.text)) {
      errors.push(`${required.path} is missing ${required.description}: ${required.text}`);
    }
  }

  for (const required of REQUIRED_STORAGE_HOT_PATH_FILES) {
    const text = findFileText(files, required.path);
    if (text === null) {
      errors.push(`${required.path} is missing for strict storage hot-path audit`);
      continue;
    }
    if (!text.includes(required.text)) {
      errors.push(`${required.path} is missing ${required.description}: ${required.text}`);
    }
  }

  for (const required of REQUIRED_LOCAL_STORE_API_FILES) {
    const text = findFileText(files, required.path);
    if (text === null) {
      errors.push(`${required.path} is missing for strict local store API audit`);
      continue;
    }
    if (!text.includes(required.text)) {
      errors.push(`${required.path} is missing ${required.description}: ${required.text}`);
    }
  }

  const runtimeSource = findFileText(files, 'packages/resonote/src/runtime.ts');
  if (runtimeSource && tokenPattern('openEventsDb').test(runtimeSource)) {
    errors.push('packages/resonote/src/runtime.ts exposes raw local store handle openEventsDb');
  }

  if (AMBIGUOUS_STRICT_COMPLETION_PATTERNS.some((pattern) => pattern.test(strictAudit.text))) {
    errors.push(
      `${strictAudit.path} claims strict final completion without preserving scoped-vs-strict distinction`
    );
  }

  for (const staleVerdict of STALE_STRICT_GOAL_PARTIAL_VERDICTS) {
    if (staleVerdict.pattern.test(strictAudit.text)) {
      errors.push(staleVerdict.message);
    }
  }
  for (const staleWording of STALE_STRICT_GOAL_FOLLOWUP_WORDING) {
    if (staleWording.pattern.test(strictAudit.text)) {
      errors.push(staleWording.message);
    }
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
    'packages/adapter-dexie/src/hot-path.contract.test.ts',
    'packages/adapter-dexie/src/schema.ts',
    'packages/resonote/src/runtime.ts',
    'packages/resonote/src/hot-event-index.ts',
    'packages/resonote/src/hot-event-index.contract.test.ts',
    'packages/resonote/src/event-coordinator.contract.test.ts',
    'packages/resonote/src/local-store-api.contract.test.ts',
    'packages/resonote/src/plugin-api.contract.test.ts',
    'packages/resonote/src/plugin-isolation.contract.test.ts',
    'packages/resonote/src/relay-repair.contract.test.ts',
    'packages/resonote/src/public-read-cutover.contract.test.ts',
    'packages/resonote/src/relay-selection-runtime.ts',
    'packages/resonote/src/relay-selection-runtime.contract.test.ts',
    'packages/resonote/src/relay-routing-publish.contract.test.ts',
    'src/shared/auftakt/resonote.ts'
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
