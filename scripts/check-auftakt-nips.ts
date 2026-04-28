import { existsSync, readFileSync } from 'node:fs';

export interface NipInventory {
  sourceUrl: string;
  sourceDate: string;
  nips: string[];
}

export interface NipMatrixEntry {
  nip: string;
  level: string;
  status: string;
  owner: string;
  proof: string;
  priority: string;
  scopeNotes: string;
}

export interface NipMatrix {
  sourceUrl: string;
  sourceDate: string;
  entries: NipMatrixEntry[];
}

const KNOWN_LEVELS = new Set([
  'public',
  'public-compat',
  'internal',
  'internal-only',
  'scoped-out'
]);
const KNOWN_STATUSES = new Set([
  'implemented',
  'partial',
  'planned',
  'deferred',
  'not-started',
  'not-applicable',
  'deprecated',
  'unrecommended'
]);
const KNOWN_PRIORITIES = new Set(['P0', 'P1', 'P2', 'P3']);
const DOCS_ONLY_OWNER = 'docs/auftakt/nip-matrix.json';
const NON_IMPLEMENTED_STATUSES = new Set([
  'not-started',
  'not-applicable',
  'deprecated',
  'unrecommended'
]);
const REQUIRED_NIP19_OWNER = 'packages/core/src/crypto.ts';
const REQUIRED_NIP19_PROOF = 'src/shared/nostr/nip19-decode.test.ts';
const REQUIRED_NIP19_PREFIXES = ['npub', 'nsec', 'note', 'nprofile', 'nevent', 'naddr', 'nrelay'];
const REQUIRED_NIP05_OWNER = 'src/shared/nostr/nip05.ts';
const REQUIRED_NIP05_PROOF = 'src/shared/nostr/nip05.test.ts';

export function checkNipMatrix(
  inventory: NipInventory,
  matrix: NipMatrix
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  errors.push(...validateInventory(inventory));
  errors.push(...validateMatrix(matrix));

  if (inventory.sourceUrl !== matrix.sourceUrl) {
    errors.push('Matrix sourceUrl differs from inventory sourceUrl');
  }
  if (inventory.sourceDate !== matrix.sourceDate) {
    errors.push('Matrix sourceDate differs from inventory sourceDate');
  }

  const inventoryNips = new Set(inventory.nips);
  const entries = new Map(matrix.entries.map((entry) => [entry.nip, entry]));
  for (const nip of inventory.nips) {
    const entry = entries.get(nip);
    if (!entry) {
      errors.push(`Missing matrix entry for NIP-${nip}`);
      continue;
    }
    errors.push(...validateMatrixEntry(entry));
  }

  for (const entry of matrix.entries) {
    if (!inventoryNips.has(entry.nip)) {
      errors.push(`Stale matrix entry for NIP-${entry.nip}`);
    }
  }

  return { ok: errors.length === 0, errors };
}

export function checkNipStatusDocsSync(
  matrix: NipMatrix,
  statusMarkdown: string
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  for (const entry of matrix.entries) {
    if (!statusMarkdown.includes(`NIP-${entry.nip}`)) {
      errors.push(`docs/auftakt/status-verification.md missing NIP-${entry.nip}`);
    }
  }
  if (/^\|\s*scoped NIP compliance\s*\|\s*Partial\s*\|/m.test(statusMarkdown)) {
    errors.push(
      'docs/auftakt/status-verification.md must not mark scoped NIP compliance as Partial after matrix proof closure'
    );
  }
  if (!/^\|\s*scoped NIP compliance\s*\|\s*Scoped-Satisfied\s*\|/m.test(statusMarkdown)) {
    errors.push(
      'docs/auftakt/status-verification.md must mark scoped NIP compliance as Scoped-Satisfied'
    );
  }
  return { ok: errors.length === 0, errors };
}

function validateInventory(inventory: NipInventory): string[] {
  const errors: string[] = [];
  if (!inventory.sourceUrl) errors.push('Inventory missing sourceUrl');
  if (!inventory.sourceDate) errors.push('Inventory missing sourceDate');
  const seen = new Set<string>();
  for (const nip of inventory.nips) {
    if (seen.has(nip)) errors.push(`Duplicate inventory NIP-${nip}`);
    seen.add(nip);
    if (nip !== nip.toUpperCase()) {
      errors.push(`Inventory NIP-${nip} is not uppercase normalized`);
    }
  }
  const sorted = [...inventory.nips].sort();
  if (inventory.nips.join('\n') !== sorted.join('\n')) {
    errors.push('Inventory NIPs are not sorted');
  }
  return errors;
}

function validateMatrix(matrix: NipMatrix): string[] {
  const errors: string[] = [];
  if (!matrix.sourceUrl) errors.push('Matrix missing sourceUrl');
  if (!matrix.sourceDate) errors.push('Matrix missing sourceDate');
  return errors;
}

function validateMatrixEntry(entry: NipMatrixEntry): string[] {
  const errors: string[] = [];
  for (const key of ['level', 'status', 'owner', 'proof', 'priority', 'scopeNotes'] as const) {
    if (!entry[key]) errors.push(`NIP-${entry.nip} missing ${key}`);
  }
  if (entry.level && !KNOWN_LEVELS.has(entry.level)) {
    errors.push(`NIP-${entry.nip} has unknown level ${entry.level}`);
  }
  if (entry.status && !KNOWN_STATUSES.has(entry.status)) {
    errors.push(`NIP-${entry.nip} has unknown status ${entry.status}`);
  }
  if (entry.priority && !KNOWN_PRIORITIES.has(entry.priority)) {
    errors.push(`NIP-${entry.nip} has unknown priority ${entry.priority}`);
  }
  if (/^(TBD|TODO|notes)$/i.test(entry.scopeNotes.trim())) {
    errors.push(`NIP-${entry.nip} missing support boundary in scopeNotes`);
  }
  if (!NON_IMPLEMENTED_STATUSES.has(entry.status)) {
    if (entry.owner === DOCS_ONLY_OWNER) {
      errors.push(`NIP-${entry.nip} ${entry.status} claim cannot use docs-only owner`);
    }
    if (entry.proof === DOCS_ONLY_OWNER) {
      errors.push(`NIP-${entry.nip} ${entry.status} claim cannot use docs-only proof`);
    }
  }
  if (entry.nip === '19') {
    errors.push(...validateNip19MatrixEntry(entry));
  }
  if (entry.nip === '05') {
    errors.push(...validateNip05MatrixEntry(entry));
  }
  return errors;
}

function validateNip05MatrixEntry(entry: NipMatrixEntry): string[] {
  const errors: string[] = [];
  if (entry.status !== 'implemented') {
    errors.push('NIP-05 must stay implemented after browser verification coverage');
  }
  if (entry.owner !== REQUIRED_NIP05_OWNER) {
    errors.push(`NIP-05 owner must be ${REQUIRED_NIP05_OWNER}`);
  }
  if (entry.proof !== REQUIRED_NIP05_PROOF) {
    errors.push(`NIP-05 proof must be ${REQUIRED_NIP05_PROOF}`);
  }
  if (/not-started|remains app-facing work/i.test(`${entry.status} ${entry.scopeNotes}`)) {
    errors.push('NIP-05 scopeNotes must not use stale not-started wording');
  }
  return errors;
}

function validateNip19MatrixEntry(entry: NipMatrixEntry): string[] {
  const errors: string[] = [];
  if (entry.status !== 'implemented') {
    errors.push('NIP-19 must stay implemented after complete standard prefix parser coverage');
  }
  if (entry.owner !== REQUIRED_NIP19_OWNER) {
    errors.push(`NIP-19 owner must be ${REQUIRED_NIP19_OWNER}`);
  }
  if (entry.proof !== REQUIRED_NIP19_PROOF) {
    errors.push(`NIP-19 proof must be ${REQUIRED_NIP19_PROOF}`);
  }
  if (/complete parser coverage pending|Entity vocabulary exists/i.test(entry.scopeNotes)) {
    errors.push('NIP-19 scopeNotes must not use stale parser-coverage-pending wording');
  }
  for (const prefix of REQUIRED_NIP19_PREFIXES) {
    if (!entry.scopeNotes.includes(prefix)) {
      errors.push(`NIP-19 scopeNotes must mention ${prefix}`);
    }
  }
  return errors;
}

export async function assertNoRewriteOnRefreshFailure(input: {
  readonly fetchOfficialInventory: () => Promise<NipInventory>;
  readonly writeFile: (path: string, contents: string) => Promise<void>;
}): Promise<{ ok: boolean; errors: string[] }> {
  try {
    await input.fetchOfficialInventory();
    return { ok: true, errors: [] };
  } catch (error) {
    return {
      ok: false,
      errors: [`Official inventory fetch failed: ${normalizeErrorMessage(error)}`]
    };
  }
}

export function proposeInventoryDrift(
  inventory: NipInventory,
  matrix: NipMatrix
): { addedNips: string[]; removedNips: string[]; statusPromotions: string[] } {
  const inventoryNips = new Set(inventory.nips);
  const matrixNips = new Set(matrix.entries.map((entry) => entry.nip));
  return {
    addedNips: inventory.nips.filter((nip) => !matrixNips.has(nip)),
    removedNips: matrix.entries.map((entry) => entry.nip).filter((nip) => !inventoryNips.has(nip)),
    statusPromotions: []
  };
}

function normalizeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const inventory = JSON.parse(
    readFileSync('docs/auftakt/nips-inventory.json', 'utf8')
  ) as NipInventory;
  const matrix = JSON.parse(readFileSync('docs/auftakt/nip-matrix.json', 'utf8')) as NipMatrix;
  const result = checkNipMatrix(inventory, matrix);
  const docsPath = 'docs/auftakt/status-verification.md';
  const docsResult = existsSync(docsPath)
    ? checkNipStatusDocsSync(matrix, readFileSync(docsPath, 'utf8'))
    : { ok: false, errors: [`Missing ${docsPath}`] };
  const errors = [...result.errors, ...docsResult.errors];
  if (errors.length > 0) {
    console.error(errors.join('\n'));
    process.exit(1);
  }
}
