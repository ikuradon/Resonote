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
const REQUIRED_NIP07_OWNER = 'src/shared/nostr/client.ts';
const REQUIRED_NIP07_PROOF = 'src/shared/nostr/client-integration.test.ts';
const REQUIRED_NIP17_OWNER = 'packages/core/src/nip17-direct-message.ts';
const REQUIRED_NIP17_PROOF = 'packages/core/src/nip17-direct-message.contract.test.ts';
const REQUIRED_NIP18_OWNER = 'src/features/comments/application/comment-actions.ts';
const REQUIRED_NIP18_PROOF = 'src/features/comments/application/comment-actions.test.ts';
const REQUIRED_NIP30_OWNER = 'packages/resonote/src/runtime.ts';
const REQUIRED_NIP30_PROOF = 'packages/resonote/src/custom-emoji.contract.test.ts';
const REQUIRED_NIP21_OWNER = 'packages/core/src/nip21-uri.ts';
const REQUIRED_NIP21_PROOF = 'packages/core/src/nip21-uri.contract.test.ts';
const REQUIRED_NIP27_OWNER = 'packages/core/src/nip27-references.ts';
const REQUIRED_NIP27_PROOF = 'packages/core/src/nip27-references.contract.test.ts';
const REQUIRED_NIP51_OWNER = 'packages/core/src/nip51-list.ts';
const REQUIRED_NIP51_PROOF = 'packages/core/src/nip51-list.contract.test.ts';
const REQUIRED_NIP59_OWNER = 'packages/core/src/nip59-gift-wrap.ts';
const REQUIRED_NIP59_PROOF = 'packages/core/src/nip59-gift-wrap.contract.test.ts';
const REQUIRED_NIP66_OWNER = 'packages/resonote/src/runtime.ts';
const REQUIRED_NIP66_PROOF = 'packages/resonote/src/relay-metrics-nip66.contract.test.ts';
const REQUIRED_RELAY_SESSION_OWNER = 'packages/core/src/relay-session.ts';
const REQUIRED_RELAY_SESSION_PROOF = 'packages/core/src/relay-session.contract.test.ts';

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

export function checkCanonicalNipSpecSync(
  matrix: NipMatrix,
  specMarkdown: string
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const entries = new Map(matrix.entries.map((entry) => [entry.nip, entry]));
  for (const specEntry of extractImplementedNipSpecRows(specMarkdown)) {
    const matrixEntry = entries.get(specEntry.nip);
    if (!matrixEntry) {
      errors.push(`docs/auftakt/nip-matrix.json missing canonical NIP-${specEntry.nip}`);
      continue;
    }
    if (matrixEntry.status !== 'implemented') {
      errors.push(
        `docs/auftakt/nip-matrix.json NIP-${specEntry.nip} must match canonical spec status implemented`
      );
    }
    if (matrixEntry.level !== specEntry.level) {
      errors.push(
        `docs/auftakt/nip-matrix.json NIP-${specEntry.nip} level must be ${specEntry.level}`
      );
    }
    if (matrixEntry.owner !== specEntry.owner) {
      errors.push(
        `docs/auftakt/nip-matrix.json NIP-${specEntry.nip} owner must be ${specEntry.owner}`
      );
    }
    if (!specEntry.proofs.includes(matrixEntry.proof)) {
      errors.push(
        `docs/auftakt/nip-matrix.json NIP-${specEntry.nip} proof must be one of ${specEntry.proofs.join(
          ', '
        )}`
      );
    }
  }
  return { ok: errors.length === 0, errors };
}

interface CanonicalNipSpecRow {
  readonly nip: string;
  readonly level: string;
  readonly owner: string;
  readonly proofs: string[];
}

function extractImplementedNipSpecRows(specMarkdown: string): CanonicalNipSpecRow[] {
  const rows: CanonicalNipSpecRow[] = [];
  for (const line of specMarkdown.split('\n')) {
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells.length < 5 || !/^NIP-[A-Z0-9]+$/.test(cells[0])) continue;
    if (!/^implemented\b/.test(cells[2])) continue;
    rows.push({
      nip: cells[0].slice('NIP-'.length),
      level: cells[1],
      owner: stripMarkdownCode(cells[3]),
      proofs: cells[4]
        .split(/<br\s*\/?>/i)
        .map(stripMarkdownCode)
        .filter(Boolean)
    });
  }
  return rows;
}

function stripMarkdownCode(value: string): string {
  return value.replace(/`/g, '').trim();
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
  if (entry.nip === '07') {
    errors.push(...validateNip07MatrixEntry(entry));
  }
  if (entry.nip === '17') {
    errors.push(...validateNip17MatrixEntry(entry));
  }
  if (entry.nip === '18') {
    errors.push(...validateNip18MatrixEntry(entry));
  }
  if (entry.nip === '21') {
    errors.push(...validateNip21MatrixEntry(entry));
  }
  if (entry.nip === '27') {
    errors.push(...validateNip27MatrixEntry(entry));
  }
  if (entry.nip === '30') {
    errors.push(...validateNip30MatrixEntry(entry));
  }
  if (entry.nip === '42') {
    errors.push(...validateNip42MatrixEntry(entry));
  }
  if (entry.nip === '51') {
    errors.push(...validateNip51MatrixEntry(entry));
  }
  if (entry.nip === '59') {
    errors.push(...validateNip59MatrixEntry(entry));
  }
  if (entry.nip === '66') {
    errors.push(...validateNip66MatrixEntry(entry));
  }
  if (entry.nip === '70') {
    errors.push(...validateNip70MatrixEntry(entry));
  }
  return errors;
}

function validateNip17MatrixEntry(entry: NipMatrixEntry): string[] {
  const errors: string[] = [];
  if (entry.status !== 'implemented') {
    errors.push('NIP-17 must stay implemented after private direct-message model coverage');
  }
  if (entry.owner !== REQUIRED_NIP17_OWNER) {
    errors.push(`NIP-17 owner must be ${REQUIRED_NIP17_OWNER}`);
  }
  if (entry.proof !== REQUIRED_NIP17_PROOF) {
    errors.push(`NIP-17 proof must be ${REQUIRED_NIP17_PROOF}`);
  }
  if (
    !/kind:14/i.test(entry.scopeNotes) ||
    !/kind:15/i.test(entry.scopeNotes) ||
    !/(10050|DM relay)/i.test(entry.scopeNotes) ||
    !/(gift wrap|NIP-59)/i.test(entry.scopeNotes)
  ) {
    errors.push(
      'NIP-17 scopeNotes must mention kind:14/15, DM relay list, and NIP-59 gift-wrap coverage'
    );
  }
  if (
    /not-started|pending|required|requires encrypted-event pipeline/i.test(
      `${entry.status} ${entry.scopeNotes}`
    )
  ) {
    errors.push('NIP-17 scopeNotes must not use stale encrypted-pipeline-pending wording');
  }
  return errors;
}

function validateNip18MatrixEntry(entry: NipMatrixEntry): string[] {
  const errors: string[] = [];
  if (entry.status !== 'implemented') {
    errors.push('NIP-18 must stay implemented after repost publish flow coverage');
  }
  if (entry.owner !== REQUIRED_NIP18_OWNER) {
    errors.push(`NIP-18 owner must be ${REQUIRED_NIP18_OWNER}`);
  }
  if (entry.proof !== REQUIRED_NIP18_PROOF) {
    errors.push(`NIP-18 proof must be ${REQUIRED_NIP18_PROOF}`);
  }
  if (!/kind:6|kind:16|relay hint|ReNote|fetch-by-id/i.test(entry.scopeNotes)) {
    errors.push('NIP-18 scopeNotes must mention repost kind coverage and relay-hint boundary');
  }
  if (/partial|pending/i.test(`${entry.status} ${entry.scopeNotes}`)) {
    errors.push('NIP-18 scopeNotes must not use stale partial UI-pending wording');
  }
  return errors;
}

function validateNip21MatrixEntry(entry: NipMatrixEntry): string[] {
  const errors: string[] = [];
  if (entry.status !== 'implemented') {
    errors.push('NIP-21 must stay implemented after nostr URI parser and route coverage');
  }
  if (entry.owner !== REQUIRED_NIP21_OWNER) {
    errors.push(`NIP-21 owner must be ${REQUIRED_NIP21_OWNER}`);
  }
  if (entry.proof !== REQUIRED_NIP21_PROOF) {
    errors.push(`NIP-21 proof must be ${REQUIRED_NIP21_PROOF}`);
  }
  if (
    !/nostr:/i.test(entry.scopeNotes) ||
    !/NIP-19/i.test(entry.scopeNotes) ||
    !/nsec/i.test(entry.scopeNotes) ||
    !/(route|resolver)/i.test(entry.scopeNotes)
  ) {
    errors.push(
      'NIP-21 scopeNotes must mention nostr:, NIP-19, nsec rejection, and route/resolver coverage'
    );
  }
  if (
    /not-started|pending|belongs app routing layer/i.test(`${entry.status} ${entry.scopeNotes}`)
  ) {
    errors.push('NIP-21 scopeNotes must not use stale routing-pending wording');
  }
  return errors;
}

function validateNip27MatrixEntry(entry: NipMatrixEntry): string[] {
  const errors: string[] = [];
  if (entry.status !== 'implemented') {
    errors.push('NIP-27 must stay implemented after text reference extraction coverage');
  }
  if (entry.owner !== REQUIRED_NIP27_OWNER) {
    errors.push(`NIP-27 owner must be ${REQUIRED_NIP27_OWNER}`);
  }
  if (entry.proof !== REQUIRED_NIP27_PROOF) {
    errors.push(`NIP-27 proof must be ${REQUIRED_NIP27_PROOF}`);
  }
  if (
    !/NIP-21/i.test(entry.scopeNotes) ||
    !/(profile|event)/i.test(entry.scopeNotes) ||
    !/(p-tag|q-tag|tags)/i.test(entry.scopeNotes) ||
    !/(content parser|parser)/i.test(entry.scopeNotes)
  ) {
    errors.push(
      'NIP-27 scopeNotes must mention NIP-21 profile/event references, tags, and parser coverage'
    );
  }
  if (
    /not-started|pending|references parsing pending/i.test(`${entry.status} ${entry.scopeNotes}`)
  ) {
    errors.push('NIP-27 scopeNotes must not use stale text-reference-pending wording');
  }
  return errors;
}

function validateNip30MatrixEntry(entry: NipMatrixEntry): string[] {
  const errors: string[] = [];
  if (entry.status !== 'implemented') {
    errors.push('NIP-30 must stay implemented after custom emoji read-model coverage');
  }
  if (entry.owner !== REQUIRED_NIP30_OWNER) {
    errors.push(`NIP-30 owner must be ${REQUIRED_NIP30_OWNER}`);
  }
  if (entry.proof !== REQUIRED_NIP30_PROOF) {
    errors.push(`NIP-30 proof must be ${REQUIRED_NIP30_PROOF}`);
  }
  if (!/shortcode|10030|30030|emoji/i.test(entry.scopeNotes)) {
    errors.push('NIP-30 scopeNotes must mention shortcode and emoji list/set coverage');
  }
  if (/partial|pending/i.test(`${entry.status} ${entry.scopeNotes}`)) {
    errors.push('NIP-30 scopeNotes must not use stale partial wording');
  }
  return errors;
}

function validateNip42MatrixEntry(entry: NipMatrixEntry): string[] {
  const errors: string[] = [];
  if (entry.status !== 'implemented') {
    errors.push('NIP-42 must stay implemented after relay AUTH retry coverage');
  }
  if (entry.owner !== REQUIRED_RELAY_SESSION_OWNER) {
    errors.push(`NIP-42 owner must be ${REQUIRED_RELAY_SESSION_OWNER}`);
  }
  if (entry.proof !== REQUIRED_RELAY_SESSION_PROOF) {
    errors.push(`NIP-42 proof must be ${REQUIRED_RELAY_SESSION_PROOF}`);
  }
  if (!/AUTH|22242|auth-required/i.test(entry.scopeNotes)) {
    errors.push('NIP-42 scopeNotes must mention AUTH, kind:22242, or auth-required retry');
  }
  if (/not-started|pending|not yet implemented/i.test(`${entry.status} ${entry.scopeNotes}`)) {
    errors.push('NIP-42 scopeNotes must not use stale not-started wording');
  }
  return errors;
}

function validateNip51MatrixEntry(entry: NipMatrixEntry): string[] {
  const errors: string[] = [];
  if (entry.status !== 'implemented') {
    errors.push('NIP-51 must stay implemented after core list model coverage');
  }
  if (entry.owner !== REQUIRED_NIP51_OWNER) {
    errors.push(`NIP-51 owner must be ${REQUIRED_NIP51_OWNER}`);
  }
  if (entry.proof !== REQUIRED_NIP51_PROOF) {
    errors.push(`NIP-51 proof must be ${REQUIRED_NIP51_PROOF}`);
  }
  if (
    !/standard lists/i.test(entry.scopeNotes) ||
    !/sets/i.test(entry.scopeNotes) ||
    !/(private|NIP-44|NIP-04)/i.test(entry.scopeNotes)
  ) {
    errors.push('NIP-51 scopeNotes must mention list/set and private payload coverage');
  }
  if (/partial|pending|not-started/i.test(`${entry.status} ${entry.scopeNotes}`)) {
    errors.push('NIP-51 scopeNotes must not use stale partial/pending wording');
  }
  return errors;
}

function validateNip59MatrixEntry(entry: NipMatrixEntry): string[] {
  const errors: string[] = [];
  if (entry.status !== 'implemented') {
    errors.push('NIP-59 must stay implemented after gift-wrap protocol coverage');
  }
  if (entry.owner !== REQUIRED_NIP59_OWNER) {
    errors.push(`NIP-59 owner must be ${REQUIRED_NIP59_OWNER}`);
  }
  if (entry.proof !== REQUIRED_NIP59_PROOF) {
    errors.push(`NIP-59 proof must be ${REQUIRED_NIP59_PROOF}`);
  }
  if (!/rumor|seal|gift wrap|1059|NIP-44/i.test(entry.scopeNotes)) {
    errors.push('NIP-59 scopeNotes must mention rumor/seal/gift-wrap and NIP-44 coverage');
  }
  if (/not-started|pending|required/i.test(`${entry.status} ${entry.scopeNotes}`)) {
    errors.push('NIP-59 scopeNotes must not use stale required/not-started wording');
  }
  return errors;
}

function validateNip66MatrixEntry(entry: NipMatrixEntry): string[] {
  const errors: string[] = [];
  if (entry.status !== 'implemented') {
    errors.push('NIP-66 must stay implemented after relay metrics read-model coverage');
  }
  if (entry.owner !== REQUIRED_NIP66_OWNER) {
    errors.push(`NIP-66 owner must be ${REQUIRED_NIP66_OWNER}`);
  }
  if (entry.proof !== REQUIRED_NIP66_PROOF) {
    errors.push(`NIP-66 proof must be ${REQUIRED_NIP66_PROOF}`);
  }
  if (!/30166|10166|relay metrics|monitor/i.test(entry.scopeNotes)) {
    errors.push('NIP-66 scopeNotes must mention discovery and monitor metric coverage');
  }
  if (/partial|seeded|pending/i.test(`${entry.status} ${entry.scopeNotes}`)) {
    errors.push('NIP-66 scopeNotes must not use stale seeded/partial wording');
  }
  return errors;
}

function validateNip70MatrixEntry(entry: NipMatrixEntry): string[] {
  const errors: string[] = [];
  if (entry.status !== 'implemented') {
    errors.push('NIP-70 must stay implemented after protected publish AUTH coverage');
  }
  if (entry.owner !== REQUIRED_RELAY_SESSION_OWNER) {
    errors.push(`NIP-70 owner must be ${REQUIRED_RELAY_SESSION_OWNER}`);
  }
  if (entry.proof !== REQUIRED_RELAY_SESSION_PROOF) {
    errors.push(`NIP-70 proof must be ${REQUIRED_RELAY_SESSION_PROOF}`);
  }
  if (!/protected|- tag|NIP-42|AUTH/i.test(entry.scopeNotes)) {
    errors.push('NIP-70 scopeNotes must mention protected-event AUTH boundary');
  }
  if (/not-started|pending|validation policy/i.test(`${entry.status} ${entry.scopeNotes}`)) {
    errors.push('NIP-70 scopeNotes must not use stale policy-pending wording');
  }
  return errors;
}

function validateNip07MatrixEntry(entry: NipMatrixEntry): string[] {
  const errors: string[] = [];
  if (entry.status !== 'implemented') {
    errors.push('NIP-07 must stay implemented after window.nostr publish integration coverage');
  }
  if (entry.owner !== REQUIRED_NIP07_OWNER) {
    errors.push(`NIP-07 owner must be ${REQUIRED_NIP07_OWNER}`);
  }
  if (entry.proof !== REQUIRED_NIP07_PROOF) {
    errors.push(`NIP-07 proof must be ${REQUIRED_NIP07_PROOF}`);
  }
  if (/partial/i.test(entry.status)) {
    errors.push('NIP-07 status must not return to partial');
  }
  if (!/window\.nostr|nip07Signer/i.test(entry.scopeNotes)) {
    errors.push('NIP-07 scopeNotes must mention the signer integration boundary');
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
  const specPath = 'docs/auftakt/spec.md';
  const specResult = existsSync(specPath)
    ? checkCanonicalNipSpecSync(matrix, readFileSync(specPath, 'utf8'))
    : { ok: false, errors: [`Missing ${specPath}`] };
  const errors = [...result.errors, ...docsResult.errors, ...specResult.errors];
  if (errors.length > 0) {
    console.error(errors.join('\n'));
    process.exit(1);
  }
}
