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
  'public-interop',
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
const REQUIRED_NIP03_OWNER = 'packages/core/src/nip03-open-timestamps.ts';
const REQUIRED_NIP03_PROOF = 'packages/core/src/nip03-open-timestamps.contract.test.ts';
const REQUIRED_NIP05_OWNER = 'src/shared/nostr/nip05.ts';
const REQUIRED_NIP05_PROOF = 'src/shared/nostr/nip05.test.ts';
const REQUIRED_NIP07_OWNER = 'src/shared/nostr/client.ts';
const REQUIRED_NIP07_PROOF = 'src/shared/nostr/client-integration.test.ts';
const REQUIRED_NIP13_OWNER = 'packages/core/src/nip13-proof-of-work.ts';
const REQUIRED_NIP13_PROOF = 'packages/core/src/nip13-proof-of-work.contract.test.ts';
const REQUIRED_NIP14_OWNER = 'packages/core/src/nip14-subject.ts';
const REQUIRED_NIP14_PROOF = 'packages/core/src/nip14-subject.contract.test.ts';
const REQUIRED_NIP17_OWNER = 'packages/core/src/nip17-direct-message.ts';
const REQUIRED_NIP17_PROOF = 'packages/core/src/nip17-direct-message.contract.test.ts';
const REQUIRED_NIP18_OWNER = 'src/features/comments/application/comment-actions.ts';
const REQUIRED_NIP18_PROOF = 'src/features/comments/application/comment-actions.test.ts';
const REQUIRED_NIP30_OWNER = 'packages/resonote/src/runtime.ts';
const REQUIRED_NIP30_PROOF = 'packages/resonote/src/custom-emoji.contract.test.ts';
const REQUIRED_NIP21_OWNER = 'packages/core/src/nip21-uri.ts';
const REQUIRED_NIP21_PROOF = 'packages/core/src/nip21-uri.contract.test.ts';
const REQUIRED_NIP23_OWNER = 'packages/core/src/nip23-long-form.ts';
const REQUIRED_NIP23_PROOF = 'packages/core/src/nip23-long-form.contract.test.ts';
const REQUIRED_NIP24_OWNER = 'packages/core/src/nip24-extra-metadata.ts';
const REQUIRED_NIP24_PROOF = 'packages/core/src/nip24-extra-metadata.contract.test.ts';
const REQUIRED_NIP27_OWNER = 'packages/core/src/nip27-references.ts';
const REQUIRED_NIP27_PROOF = 'packages/core/src/nip27-references.contract.test.ts';
const REQUIRED_NIP28_OWNER = 'packages/core/src/nip28-public-chat.ts';
const REQUIRED_NIP28_PROOF = 'packages/core/src/nip28-public-chat.contract.test.ts';
const REQUIRED_NIP31_OWNER = 'packages/core/src/nip31-alt.ts';
const REQUIRED_NIP31_PROOF = 'packages/core/src/nip31-alt.contract.test.ts';
const REQUIRED_NIP32_OWNER = 'packages/core/src/nip32-label.ts';
const REQUIRED_NIP32_PROOF = 'packages/core/src/nip32-label.contract.test.ts';
const REQUIRED_NIP36_OWNER = 'packages/core/src/nip36-content-warning.ts';
const REQUIRED_NIP36_PROOF = 'packages/core/src/nip36-content-warning.contract.test.ts';
const REQUIRED_NIP37_OWNER = 'packages/core/src/nip37-draft-wrap.ts';
const REQUIRED_NIP37_PROOF = 'packages/core/src/nip37-draft-wrap.contract.test.ts';
const REQUIRED_NIP38_OWNER = 'packages/core/src/nip38-user-status.ts';
const REQUIRED_NIP38_PROOF = 'packages/core/src/nip38-user-status.contract.test.ts';
const REQUIRED_NIP39_OWNER = 'packages/core/src/nip39-external-identity.ts';
const REQUIRED_NIP39_PROOF = 'packages/core/src/nip39-external-identity.contract.test.ts';
const REQUIRED_NIP40_OWNER = 'packages/adapter-dexie/src/index.ts';
const REQUIRED_NIP40_PROOF = 'packages/adapter-dexie/src/materialization.contract.test.ts';
const REQUIRED_NIP43_OWNER = 'packages/core/src/nip43-relay-access.ts';
const REQUIRED_NIP43_PROOF = 'packages/core/src/nip43-relay-access.contract.test.ts';
const REQUIRED_NIP46_OWNER = 'packages/core/src/nip46-remote-signing.ts';
const REQUIRED_NIP46_PROOF = 'packages/core/src/nip46-remote-signing.contract.test.ts';
const REQUIRED_NIP48_OWNER = 'packages/core/src/nip48-proxy-tags.ts';
const REQUIRED_NIP48_PROOF = 'packages/core/src/nip48-proxy-tags.contract.test.ts';
const REQUIRED_NIP50_OWNER = 'packages/core/src/nip50-search.ts';
const REQUIRED_NIP50_PROOF = 'packages/core/src/nip50-search.contract.test.ts';
const REQUIRED_NIP51_OWNER = 'packages/core/src/nip51-list.ts';
const REQUIRED_NIP51_PROOF = 'packages/core/src/nip51-list.contract.test.ts';
const REQUIRED_NIP52_OWNER = 'packages/core/src/nip52-calendar.ts';
const REQUIRED_NIP52_PROOF = 'packages/core/src/nip52-calendar.contract.test.ts';
const REQUIRED_NIP53_OWNER = 'packages/core/src/nip53-live-activity.ts';
const REQUIRED_NIP53_PROOF = 'packages/core/src/nip53-live-activity.contract.test.ts';
const REQUIRED_NIP55_OWNER = 'packages/core/src/nip55-android-signer.ts';
const REQUIRED_NIP55_PROOF = 'packages/core/src/nip55-android-signer.contract.test.ts';
const REQUIRED_NIP56_OWNER = 'packages/core/src/nip56-report.ts';
const REQUIRED_NIP56_PROOF = 'packages/core/src/nip56-report.contract.test.ts';
const REQUIRED_NIP58_OWNER = 'packages/core/src/nip58-badges.ts';
const REQUIRED_NIP58_PROOF = 'packages/core/src/nip58-badges.contract.test.ts';
const REQUIRED_NIP59_OWNER = 'packages/core/src/nip59-gift-wrap.ts';
const REQUIRED_NIP59_PROOF = 'packages/core/src/nip59-gift-wrap.contract.test.ts';
const REQUIRED_NIP62_OWNER = 'packages/adapter-dexie/src/index.ts';
const REQUIRED_NIP62_PROOF = 'packages/adapter-dexie/src/materialization.contract.test.ts';
const REQUIRED_NIP66_OWNER = 'packages/resonote/src/runtime.ts';
const REQUIRED_NIP66_PROOF = 'packages/resonote/src/relay-metrics-nip66.contract.test.ts';
const REQUIRED_NIP68_OWNER = 'packages/core/src/nip68-picture.ts';
const REQUIRED_NIP68_PROOF = 'packages/core/src/nip68-picture.contract.test.ts';
const REQUIRED_NIP71_OWNER = 'packages/core/src/nip71-video.ts';
const REQUIRED_NIP71_PROOF = 'packages/core/src/nip71-video.contract.test.ts';
const REQUIRED_NIP72_OWNER = 'packages/core/src/nip72-community.ts';
const REQUIRED_NIP72_PROOF = 'packages/core/src/nip72-community.contract.test.ts';
const REQUIRED_NIP78_OWNER = 'packages/core/src/nip78-application-data.ts';
const REQUIRED_NIP78_PROOF = 'packages/core/src/nip78-application-data.contract.test.ts';
const REQUIRED_NIP7D_OWNER = 'packages/core/src/nip7d-thread.ts';
const REQUIRED_NIP7D_PROOF = 'packages/core/src/nip7d-thread.contract.test.ts';
const REQUIRED_NIP84_OWNER = 'packages/core/src/nip84-highlight.ts';
const REQUIRED_NIP84_PROOF = 'packages/core/src/nip84-highlight.contract.test.ts';
const REQUIRED_NIP85_OWNER = 'packages/core/src/nip85-trusted-assertions.ts';
const REQUIRED_NIP85_PROOF = 'packages/core/src/nip85-trusted-assertions.contract.test.ts';
const REQUIRED_NIP86_OWNER = 'packages/core/src/nip86-relay-management.ts';
const REQUIRED_NIP86_PROOF = 'packages/core/src/nip86-relay-management.contract.test.ts';
const REQUIRED_NIP88_OWNER = 'packages/core/src/nip88-polls.ts';
const REQUIRED_NIP88_PROOF = 'packages/core/src/nip88-polls.contract.test.ts';
const REQUIRED_NIP89_OWNER = 'packages/core/src/nip89-application-handlers.ts';
const REQUIRED_NIP89_PROOF = 'packages/core/src/nip89-application-handlers.contract.test.ts';
const REQUIRED_NIP92_OWNER = 'packages/core/src/nip92-media-attachments.ts';
const REQUIRED_NIP92_PROOF = 'packages/core/src/nip92-media-attachments.contract.test.ts';
const REQUIRED_NIP94_OWNER = 'packages/core/src/nip94-file-metadata.ts';
const REQUIRED_NIP94_PROOF = 'packages/core/src/nip94-file-metadata.contract.test.ts';
const REQUIRED_NIP98_OWNER = 'packages/core/src/nip98-http-auth.ts';
const REQUIRED_NIP98_PROOF = 'packages/core/src/nip98-http-auth.contract.test.ts';
const REQUIRED_NIPA0_OWNER = 'packages/core/src/nipA0-voice-messages.ts';
const REQUIRED_NIPA0_PROOF = 'packages/core/src/nipA0-voice-messages.contract.test.ts';
const REQUIRED_NIPA4_OWNER = 'packages/core/src/nipA4-public-messages.ts';
const REQUIRED_NIPA4_PROOF = 'packages/core/src/nipA4-public-messages.contract.test.ts';
const REQUIRED_NIPB7_OWNER = 'packages/core/src/nipB7-blossom.ts';
const REQUIRED_NIPB7_PROOF = 'packages/core/src/nipB7-blossom.contract.test.ts';
const REQUIRED_NIPC0_OWNER = 'packages/core/src/nipC0-code-snippets.ts';
const REQUIRED_NIPC0_PROOF = 'packages/core/src/nipC0-code-snippets.contract.test.ts';
const REQUIRED_NIPC7_OWNER = 'packages/core/src/nipC7-chats.ts';
const REQUIRED_NIPC7_PROOF = 'packages/core/src/nipC7-chats.contract.test.ts';
const REQUIRED_RELAY_SESSION_OWNER = 'packages/core/src/relay-session.ts';
const REQUIRED_RELAY_SESSION_PROOF = 'packages/core/src/relay-session.contract.test.ts';
const REQUIRED_NIP01_OWNER = 'packages/runtime/src/relay-session.ts';
const REQUIRED_NIP01_PROOF = 'packages/runtime/src/relay-session.contract.test.ts';
const REQUIRED_NIP11_OWNER = 'packages/runtime/src/relay-session.ts';
const REQUIRED_NIP11_PROOF = 'packages/runtime/src/relay-session.contract.test.ts';
const REQUIRED_NIP65_OWNER = 'src/shared/browser/relays.svelte.ts';
const REQUIRED_NIP65_READ_PROOF = 'src/shared/browser/relays-fetch.test.ts';

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
  if (entry.nip === '03') {
    errors.push(...validateNip03MatrixEntry(entry));
  }
  if (entry.nip === '01') {
    errors.push(...validateNip01MatrixEntry(entry));
  }
  if (entry.nip === '05') {
    errors.push(...validateNip05MatrixEntry(entry));
  }
  if (entry.nip === '07') {
    errors.push(...validateNip07MatrixEntry(entry));
  }
  if (entry.nip === '11') {
    errors.push(...validateNip11MatrixEntry(entry));
  }
  if (entry.nip === '65') {
    errors.push(...validateNip65MatrixEntry(entry));
  }
  if (entry.nip === '13') {
    errors.push(...validateNip13MatrixEntry(entry));
  }
  if (entry.nip === '14') {
    errors.push(...validateNip14MatrixEntry(entry));
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
  if (entry.nip === '23') {
    errors.push(...validateNip23MatrixEntry(entry));
  }
  if (entry.nip === '24') {
    errors.push(...validateNip24MatrixEntry(entry));
  }
  if (entry.nip === '27') {
    errors.push(...validateNip27MatrixEntry(entry));
  }
  if (entry.nip === '28') {
    errors.push(...validateNip28MatrixEntry(entry));
  }
  if (entry.nip === '30') {
    errors.push(...validateNip30MatrixEntry(entry));
  }
  if (entry.nip === '31') {
    errors.push(...validateNip31MatrixEntry(entry));
  }
  if (entry.nip === '32') {
    errors.push(...validateNip32MatrixEntry(entry));
  }
  if (entry.nip === '36') {
    errors.push(...validateNip36MatrixEntry(entry));
  }
  if (entry.nip === '37') {
    errors.push(...validateNip37MatrixEntry(entry));
  }
  if (entry.nip === '38') {
    errors.push(...validateNip38MatrixEntry(entry));
  }
  if (entry.nip === '39') {
    errors.push(...validateNip39MatrixEntry(entry));
  }
  if (entry.nip === '40') {
    errors.push(...validateNip40MatrixEntry(entry));
  }
  if (entry.nip === '42') {
    errors.push(...validateNip42MatrixEntry(entry));
  }
  if (entry.nip === '43') {
    errors.push(...validateNip43MatrixEntry(entry));
  }
  if (entry.nip === '45') {
    errors.push(...validateNip45MatrixEntry(entry));
  }
  if (entry.nip === '46') {
    errors.push(...validateNip46MatrixEntry(entry));
  }
  if (entry.nip === '48') {
    errors.push(...validateNip48MatrixEntry(entry));
  }
  if (entry.nip === '50') {
    errors.push(...validateNip50MatrixEntry(entry));
  }
  if (entry.nip === '51') {
    errors.push(...validateNip51MatrixEntry(entry));
  }
  if (entry.nip === '52') {
    errors.push(...validateNip52MatrixEntry(entry));
  }
  if (entry.nip === '53') {
    errors.push(...validateNip53MatrixEntry(entry));
  }
  if (entry.nip === '55') {
    errors.push(...validateNip55MatrixEntry(entry));
  }
  if (entry.nip === '56') {
    errors.push(...validateNip56MatrixEntry(entry));
  }
  if (entry.nip === '58') {
    errors.push(...validateNip58MatrixEntry(entry));
  }
  if (entry.nip === '59') {
    errors.push(...validateNip59MatrixEntry(entry));
  }
  if (entry.nip === '62') {
    errors.push(...validateNip62MatrixEntry(entry));
  }
  if (entry.nip === '66') {
    errors.push(...validateNip66MatrixEntry(entry));
  }
  if (entry.nip === '68') {
    errors.push(...validateNip68MatrixEntry(entry));
  }
  if (entry.nip === '70') {
    errors.push(...validateNip70MatrixEntry(entry));
  }
  if (entry.nip === '71') {
    errors.push(...validateNip71MatrixEntry(entry));
  }
  if (entry.nip === '72') {
    errors.push(...validateNip72MatrixEntry(entry));
  }
  if (entry.nip === '78') {
    errors.push(...validateNip78MatrixEntry(entry));
  }
  if (entry.nip === '7D') {
    errors.push(...validateNip7dMatrixEntry(entry));
  }
  if (entry.nip === '84') {
    errors.push(...validateNip84MatrixEntry(entry));
  }
  if (entry.nip === '85') {
    errors.push(...validateNip85MatrixEntry(entry));
  }
  if (entry.nip === '86') {
    errors.push(...validateNip86MatrixEntry(entry));
  }
  if (entry.nip === '88') {
    errors.push(...validateNip88MatrixEntry(entry));
  }
  if (entry.nip === '89') {
    errors.push(...validateNip89MatrixEntry(entry));
  }
  if (entry.nip === '92') {
    errors.push(...validateNip92MatrixEntry(entry));
  }
  if (entry.nip === '94') {
    errors.push(...validateNip94MatrixEntry(entry));
  }
  if (entry.nip === '98') {
    errors.push(...validateNip98MatrixEntry(entry));
  }
  if (entry.nip === 'A0') {
    errors.push(...validateNipA0MatrixEntry(entry));
  }
  if (entry.nip === 'A4') {
    errors.push(...validateNipA4MatrixEntry(entry));
  }
  if (entry.nip === 'B7') {
    errors.push(...validateNipB7MatrixEntry(entry));
  }
  if (entry.nip === 'C0') {
    errors.push(...validateNipC0MatrixEntry(entry));
  }
  if (entry.nip === 'C7') {
    errors.push(...validateNipC7MatrixEntry(entry));
  }
  return errors;
}

function validateNip03MatrixEntry(entry: NipMatrixEntry): string[] {
  const errors: string[] = [];
  if (entry.status !== 'implemented') {
    errors.push('NIP-03 must stay implemented after OpenTimestamps helper coverage');
  }
  if (entry.owner !== REQUIRED_NIP03_OWNER) {
    errors.push(`NIP-03 owner must be ${REQUIRED_NIP03_OWNER}`);
  }
  if (entry.proof !== REQUIRED_NIP03_PROOF) {
    errors.push(`NIP-03 proof must be ${REQUIRED_NIP03_PROOF}`);
  }
  if (
    !/(OpenTimestamps|OTS)/i.test(entry.scopeNotes) ||
    !/(kind:1040|1040)/i.test(entry.scopeNotes) ||
    !/base64/i.test(entry.scopeNotes) ||
    !/(target e|e tag|e\/k)/i.test(entry.scopeNotes) ||
    !/(target k|k tag|e\/k)/i.test(entry.scopeNotes) ||
    !/(filter|relay)/i.test(entry.scopeNotes) ||
    !/(external|verification|verifier)/i.test(entry.scopeNotes)
  ) {
    errors.push(
      'NIP-03 scopeNotes must mention OpenTimestamps kind:1040, base64 OTS content, target e/k tags, filters, and external verification boundary'
    );
  }
  if (
    /not-started|pending|not required|outside current client runtime/i.test(
      `${entry.status} ${entry.scopeNotes}`
    )
  ) {
    errors.push('NIP-03 scopeNotes must not use stale OpenTimestamps-out-of-scope wording');
  }
  return errors;
}

function validateNip13MatrixEntry(entry: NipMatrixEntry): string[] {
  const errors: string[] = [];
  if (entry.status !== 'implemented') {
    errors.push('NIP-13 must stay implemented after proof-of-work helper coverage');
  }
  if (entry.owner !== REQUIRED_NIP13_OWNER) {
    errors.push(`NIP-13 owner must be ${REQUIRED_NIP13_OWNER}`);
  }
  if (entry.proof !== REQUIRED_NIP13_PROOF) {
    errors.push(`NIP-13 proof must be ${REQUIRED_NIP13_PROOF}`);
  }
  if (
    !/(proof-of-work|PoW|leading zero)/i.test(entry.scopeNotes) ||
    !/(nonce|difficulty)/i.test(entry.scopeNotes) ||
    !/(validate|calculate|count)/i.test(entry.scopeNotes)
  ) {
    errors.push(
      'NIP-13 scopeNotes must mention proof-of-work, nonce/difficulty, and validation helpers'
    );
  }
  if (/not-started|pending|not required/i.test(`${entry.status} ${entry.scopeNotes}`)) {
    errors.push('NIP-13 scopeNotes must not use stale not-required/pending wording');
  }
  return errors;
}

function validateNip14MatrixEntry(entry: NipMatrixEntry): string[] {
  const errors: string[] = [];
  if (entry.status !== 'implemented') {
    errors.push('NIP-14 must stay implemented after subject tag helper coverage');
  }
  if (entry.owner !== REQUIRED_NIP14_OWNER) {
    errors.push(`NIP-14 owner must be ${REQUIRED_NIP14_OWNER}`);
  }
  if (entry.proof !== REQUIRED_NIP14_PROOF) {
    errors.push(`NIP-14 proof must be ${REQUIRED_NIP14_PROOF}`);
  }
  if (
    !/(subject tag|subject)/i.test(entry.scopeNotes) ||
    !/(kind:1|text event)/i.test(entry.scopeNotes) ||
    !/(reply|Re:|80)/i.test(entry.scopeNotes)
  ) {
    errors.push(
      'NIP-14 scopeNotes must mention subject tags, text events, and reply/length helpers'
    );
  }
  if (/not-started|pending|client\/plugin layer/i.test(`${entry.status} ${entry.scopeNotes}`)) {
    errors.push('NIP-14 scopeNotes must not use stale client-layer pending wording');
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

function validateNip23MatrixEntry(entry: NipMatrixEntry): string[] {
  const errors: string[] = [];
  if (entry.status !== 'implemented') {
    errors.push('NIP-23 must stay implemented after long-form model coverage');
  }
  if (entry.owner !== REQUIRED_NIP23_OWNER) {
    errors.push(`NIP-23 owner must be ${REQUIRED_NIP23_OWNER}`);
  }
  if (entry.proof !== REQUIRED_NIP23_PROOF) {
    errors.push(`NIP-23 proof must be ${REQUIRED_NIP23_PROOF}`);
  }
  if (
    !/30023|30024|long-form/i.test(entry.scopeNotes) ||
    !/(d tag|identifier)/i.test(entry.scopeNotes) ||
    !/(title|summary|published_at|topic)/i.test(entry.scopeNotes)
  ) {
    errors.push('NIP-23 scopeNotes must mention kind:30023/30024 long-form metadata and d tags');
  }
  if (
    /not-started|pending|long-form rendering and indexing pending/i.test(
      `${entry.status} ${entry.scopeNotes}`
    )
  ) {
    errors.push('NIP-23 scopeNotes must not use stale long-form-pending wording');
  }
  return errors;
}

function validateNip24MatrixEntry(entry: NipMatrixEntry): string[] {
  const errors: string[] = [];
  if (entry.status !== 'implemented') {
    errors.push('NIP-24 must stay implemented after extra metadata model coverage');
  }
  if (entry.owner !== REQUIRED_NIP24_OWNER) {
    errors.push(`NIP-24 owner must be ${REQUIRED_NIP24_OWNER}`);
  }
  if (entry.proof !== REQUIRED_NIP24_PROOF) {
    errors.push(`NIP-24 proof must be ${REQUIRED_NIP24_PROOF}`);
  }
  if (
    !/(kind:0|profile metadata|display_name)/i.test(entry.scopeNotes) ||
    !/(website|banner|bot|birthday)/i.test(entry.scopeNotes) ||
    !/(kind:3|relay map|NIP-65)/i.test(entry.scopeNotes) ||
    !/(r\/i\/title\/t|generic tags|hashtag)/i.test(entry.scopeNotes)
  ) {
    errors.push(
      'NIP-24 scopeNotes must mention kind:0 extras, deprecated kind:3 relay maps, and generic tag helpers'
    );
  }
  if (/not-started|pending|require profile model/i.test(`${entry.status} ${entry.scopeNotes}`)) {
    errors.push('NIP-24 scopeNotes must not use stale profile-model-pending wording');
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

function validateNip28MatrixEntry(entry: NipMatrixEntry): string[] {
  const errors: string[] = [];
  if (entry.status !== 'implemented') {
    errors.push('NIP-28 must stay implemented after public chat helper coverage');
  }
  if (entry.owner !== REQUIRED_NIP28_OWNER) {
    errors.push(`NIP-28 owner must be ${REQUIRED_NIP28_OWNER}`);
  }
  if (entry.proof !== REQUIRED_NIP28_PROOF) {
    errors.push(`NIP-28 proof must be ${REQUIRED_NIP28_PROOF}`);
  }
  if (
    !/(kind:40|40).*channel/i.test(entry.scopeNotes) ||
    !/(kind:41|41).*metadata/i.test(entry.scopeNotes) ||
    !/(kind:42|42).*(message|root|reply)/i.test(entry.scopeNotes) ||
    !/(kind:43|43).*(hide|moderation)/i.test(entry.scopeNotes) ||
    !/(kind:44|44).*(mute|moderation)/i.test(entry.scopeNotes) ||
    !/(metadata JSON|categories|relay filters)/i.test(entry.scopeNotes)
  ) {
    errors.push(
      'NIP-28 scopeNotes must mention channel create/metadata/messages, hide/mute moderation, metadata JSON, categories, and relay filters'
    );
  }
  if (
    /not-started|pending|outside current client scope/i.test(`${entry.status} ${entry.scopeNotes}`)
  ) {
    errors.push('NIP-28 scopeNotes must not use stale public-chat-out-of-scope wording');
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

function validateNip31MatrixEntry(entry: NipMatrixEntry): string[] {
  const errors: string[] = [];
  if (entry.status !== 'implemented') {
    errors.push('NIP-31 must stay implemented after alt-tag fallback coverage');
  }
  if (entry.owner !== REQUIRED_NIP31_OWNER) {
    errors.push(`NIP-31 owner must be ${REQUIRED_NIP31_OWNER}`);
  }
  if (entry.proof !== REQUIRED_NIP31_PROOF) {
    errors.push(`NIP-31 proof must be ${REQUIRED_NIP31_PROOF}`);
  }
  if (
    !/alt/i.test(entry.scopeNotes) ||
    !/(unknown|custom)/i.test(entry.scopeNotes) ||
    !/(fallback|human-readable)/i.test(entry.scopeNotes) ||
    !/(content reaction|kind:17)/i.test(entry.scopeNotes)
  ) {
    errors.push(
      'NIP-31 scopeNotes must mention alt-tag fallback for unknown/custom content reaction events'
    );
  }
  if (/partial|pending|dedicated handling pending/i.test(`${entry.status} ${entry.scopeNotes}`)) {
    errors.push('NIP-31 scopeNotes must not use stale unknown-event-pending wording');
  }
  return errors;
}

function validateNip32MatrixEntry(entry: NipMatrixEntry): string[] {
  const errors: string[] = [];
  if (entry.status !== 'implemented') {
    errors.push('NIP-32 must stay implemented after labeling model coverage');
  }
  if (entry.owner !== REQUIRED_NIP32_OWNER) {
    errors.push(`NIP-32 owner must be ${REQUIRED_NIP32_OWNER}`);
  }
  if (entry.proof !== REQUIRED_NIP32_PROOF) {
    errors.push(`NIP-32 proof must be ${REQUIRED_NIP32_PROOF}`);
  }
  if (
    !/(kind:1985|label event)/i.test(entry.scopeNotes) ||
    !/(L tag|namespace)/i.test(entry.scopeNotes) ||
    !/(l tag|label tag)/i.test(entry.scopeNotes) ||
    !/(target|e\/p\/a\/r\/t)/i.test(entry.scopeNotes) ||
    !/(self-report|self-label)/i.test(entry.scopeNotes)
  ) {
    errors.push(
      'NIP-32 scopeNotes must mention kind:1985 labels, namespaces, targets, and self-reporting'
    );
  }
  if (/not-started|pending|labeling model/i.test(`${entry.status} ${entry.scopeNotes}`)) {
    errors.push('NIP-32 scopeNotes must not use stale labeling-model-pending wording');
  }
  return errors;
}

function validateNip36MatrixEntry(entry: NipMatrixEntry): string[] {
  const errors: string[] = [];
  if (entry.status !== 'implemented') {
    errors.push('NIP-36 must stay implemented after content-warning tag coverage');
  }
  if (entry.owner !== REQUIRED_NIP36_OWNER) {
    errors.push(`NIP-36 owner must be ${REQUIRED_NIP36_OWNER}`);
  }
  if (entry.proof !== REQUIRED_NIP36_PROOF) {
    errors.push(`NIP-36 proof must be ${REQUIRED_NIP36_PROOF}`);
  }
  if (
    !/content-warning/i.test(entry.scopeNotes) ||
    !/(reason|optional)/i.test(entry.scopeNotes) ||
    !/(comment|buildComment|event builder)/i.test(entry.scopeNotes)
  ) {
    errors.push(
      'NIP-36 scopeNotes must mention content-warning reason handling and comment builder coverage'
    );
  }
  if (/not-started|pending|moderation pending/i.test(`${entry.status} ${entry.scopeNotes}`)) {
    errors.push('NIP-36 scopeNotes must not use stale moderation-pending wording');
  }
  return errors;
}

function validateNip37MatrixEntry(entry: NipMatrixEntry): string[] {
  const errors: string[] = [];
  if (entry.status !== 'implemented') {
    errors.push('NIP-37 must stay implemented after draft-wrap model coverage');
  }
  if (entry.owner !== REQUIRED_NIP37_OWNER) {
    errors.push(`NIP-37 owner must be ${REQUIRED_NIP37_OWNER}`);
  }
  if (entry.proof !== REQUIRED_NIP37_PROOF) {
    errors.push(`NIP-37 proof must be ${REQUIRED_NIP37_PROOF}`);
  }
  if (
    !/31234|draft wrap/i.test(entry.scopeNotes) ||
    !/10013|private relay/i.test(entry.scopeNotes) ||
    !/(NIP-44|encrypted)/i.test(entry.scopeNotes)
  ) {
    errors.push(
      'NIP-37 scopeNotes must mention kind:31234 draft wraps, kind:10013 private relays, and encryption boundary'
    );
  }
  if (
    /not-started|pending|draft event handling pending/i.test(`${entry.status} ${entry.scopeNotes}`)
  ) {
    errors.push('NIP-37 scopeNotes must not use stale draft-pending wording');
  }
  return errors;
}

function validateNip38MatrixEntry(entry: NipMatrixEntry): string[] {
  const errors: string[] = [];
  if (entry.status !== 'implemented') {
    errors.push('NIP-38 must stay implemented after user-status model coverage');
  }
  if (entry.owner !== REQUIRED_NIP38_OWNER) {
    errors.push(`NIP-38 owner must be ${REQUIRED_NIP38_OWNER}`);
  }
  if (entry.proof !== REQUIRED_NIP38_PROOF) {
    errors.push(`NIP-38 proof must be ${REQUIRED_NIP38_PROOF}`);
  }
  if (
    !/(30315|user status)/i.test(entry.scopeNotes) ||
    !/(d tag|status type|general|music)/i.test(entry.scopeNotes) ||
    !/(expiration|NIP-40)/i.test(entry.scopeNotes) ||
    !/(r\/p\/e\/a|links|link tags)/i.test(entry.scopeNotes) ||
    !/(clear|empty content)/i.test(entry.scopeNotes)
  ) {
    errors.push(
      'NIP-38 scopeNotes must mention kind:30315 status type, expiration, links, and clear semantics'
    );
  }
  if (/not-started|pending|read model pending/i.test(`${entry.status} ${entry.scopeNotes}`)) {
    errors.push('NIP-38 scopeNotes must not use stale user-status-pending wording');
  }
  return errors;
}

function validateNip39MatrixEntry(entry: NipMatrixEntry): string[] {
  const errors: string[] = [];
  if (entry.status !== 'implemented') {
    errors.push('NIP-39 must stay implemented after external-identity model coverage');
  }
  if (entry.owner !== REQUIRED_NIP39_OWNER) {
    errors.push(`NIP-39 owner must be ${REQUIRED_NIP39_OWNER}`);
  }
  if (entry.proof !== REQUIRED_NIP39_PROOF) {
    errors.push(`NIP-39 proof must be ${REQUIRED_NIP39_PROOF}`);
  }
  if (
    !/(10011|external identit)/i.test(entry.scopeNotes) ||
    !/(i tag|platform:identity|proof)/i.test(entry.scopeNotes) ||
    !/(github|twitter|mastodon|telegram)/i.test(entry.scopeNotes) ||
    !/(proof URL|filter|#i|future)/i.test(entry.scopeNotes)
  ) {
    errors.push(
      'NIP-39 scopeNotes must mention kind:10011, i tags, known providers, proof URLs, and filters'
    );
  }
  if (/not-started|pending|parsing pending/i.test(`${entry.status} ${entry.scopeNotes}`)) {
    errors.push('NIP-39 scopeNotes must not use stale external-identity-pending wording');
  }
  return errors;
}

function validateNip40MatrixEntry(entry: NipMatrixEntry): string[] {
  const errors: string[] = [];
  if (entry.status !== 'implemented') {
    errors.push('NIP-40 must stay implemented after expiration compaction coverage');
  }
  if (entry.owner !== REQUIRED_NIP40_OWNER) {
    errors.push(`NIP-40 owner must be ${REQUIRED_NIP40_OWNER}`);
  }
  if (entry.proof !== REQUIRED_NIP40_PROOF) {
    errors.push(`NIP-40 proof must be ${REQUIRED_NIP40_PROOF}`);
  }
  if (
    !/expiration/i.test(entry.scopeNotes) ||
    !/(Dexie|adapter|local)/i.test(entry.scopeNotes) ||
    !/(visibility|hide|compaction|compact)/i.test(entry.scopeNotes)
  ) {
    errors.push(
      'NIP-40 scopeNotes must mention expiration handling through Dexie/local visibility and compaction'
    );
  }
  if (
    /not-started|pending|timestamp compaction pending/i.test(`${entry.status} ${entry.scopeNotes}`)
  ) {
    errors.push('NIP-40 scopeNotes must not use stale compaction-pending wording');
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

function validateNip43MatrixEntry(entry: NipMatrixEntry): string[] {
  const errors: string[] = [];
  if (entry.status !== 'implemented') {
    errors.push('NIP-43 must stay implemented after relay access helper coverage');
  }
  if (entry.owner !== REQUIRED_NIP43_OWNER) {
    errors.push(`NIP-43 owner must be ${REQUIRED_NIP43_OWNER}`);
  }
  if (entry.proof !== REQUIRED_NIP43_PROOF) {
    errors.push(`NIP-43 proof must be ${REQUIRED_NIP43_PROOF}`);
  }
  if (
    !/(13534|member list)/i.test(entry.scopeNotes) ||
    !/(8000|add-member|add member)/i.test(entry.scopeNotes) ||
    !/(8001|remove-member|remove member)/i.test(entry.scopeNotes) ||
    !/(28934|join request)/i.test(entry.scopeNotes) ||
    !/(28935|invite claim)/i.test(entry.scopeNotes) ||
    !/(28936|leave request)/i.test(entry.scopeNotes) ||
    !/(claim tag|restricted OK|supported_nips)/i.test(entry.scopeNotes)
  ) {
    errors.push(
      'NIP-43 scopeNotes must mention protected member lists, add/remove member events, join/invite/leave requests, claim tags, restricted OK messages, and supported_nips checks'
    );
  }
  if (/not-started|pending|outside current scope/i.test(`${entry.status} ${entry.scopeNotes}`)) {
    errors.push('NIP-43 scopeNotes must not use stale relay-access-out-of-scope wording');
  }
  return errors;
}

function validateNip45MatrixEntry(entry: NipMatrixEntry): string[] {
  const errors: string[] = [];
  if (entry.status !== 'implemented') {
    errors.push('NIP-45 must stay implemented after COUNT transport coverage');
  }
  if (entry.owner !== REQUIRED_RELAY_SESSION_OWNER) {
    errors.push(`NIP-45 owner must be ${REQUIRED_RELAY_SESSION_OWNER}`);
  }
  if (entry.proof !== REQUIRED_RELAY_SESSION_PROOF) {
    errors.push(`NIP-45 proof must be ${REQUIRED_RELAY_SESSION_PROOF}`);
  }
  if (
    !/COUNT/i.test(entry.scopeNotes) ||
    !/(request|response|transport)/i.test(entry.scopeNotes) ||
    !/(CLOSED|unsupported|invalid)/i.test(entry.scopeNotes)
  ) {
    errors.push(
      'NIP-45 scopeNotes must mention COUNT request/response transport and CLOSED/invalid handling'
    );
  }
  if (/not-started|pending|count support pending/i.test(`${entry.status} ${entry.scopeNotes}`)) {
    errors.push('NIP-45 scopeNotes must not use stale COUNT-pending wording');
  }
  return errors;
}

function validateNip46MatrixEntry(entry: NipMatrixEntry): string[] {
  const errors: string[] = [];
  if (entry.status !== 'implemented') {
    errors.push('NIP-46 must stay implemented after remote signing protocol helper coverage');
  }
  if (entry.owner !== REQUIRED_NIP46_OWNER) {
    errors.push(`NIP-46 owner must be ${REQUIRED_NIP46_OWNER}`);
  }
  if (entry.proof !== REQUIRED_NIP46_PROOF) {
    errors.push(`NIP-46 proof must be ${REQUIRED_NIP46_PROOF}`);
  }
  if (
    !/(remote signing|bunker|nostrconnect)/i.test(entry.scopeNotes) ||
    !/(request|response|JSON-RPC|payload)/i.test(entry.scopeNotes) ||
    !/(24133|auth challenge|permission)/i.test(entry.scopeNotes)
  ) {
    errors.push(
      'NIP-46 scopeNotes must mention remote signing URLs, request/response payloads, and kind:24133/auth coverage'
    );
  }
  if (/not-started|pending|remote signing pending/i.test(`${entry.status} ${entry.scopeNotes}`)) {
    errors.push('NIP-46 scopeNotes must not use stale remote-signing-pending wording');
  }
  return errors;
}

function validateNip48MatrixEntry(entry: NipMatrixEntry): string[] {
  const errors: string[] = [];
  if (entry.status !== 'implemented') {
    errors.push('NIP-48 must stay implemented after proxy-tag helper coverage');
  }
  if (entry.owner !== REQUIRED_NIP48_OWNER) {
    errors.push(`NIP-48 owner must be ${REQUIRED_NIP48_OWNER}`);
  }
  if (entry.proof !== REQUIRED_NIP48_PROOF) {
    errors.push(`NIP-48 proof must be ${REQUIRED_NIP48_PROOF}`);
  }
  if (
    !/(proxy tag|proxy)/i.test(entry.scopeNotes) ||
    !/(activitypub|atproto|rss|web)/i.test(entry.scopeNotes) ||
    !/(URL|AT URI|source ID|ID format)/i.test(entry.scopeNotes) ||
    !/(any event kind|arbitrary event|append)/i.test(entry.scopeNotes)
  ) {
    errors.push(
      'NIP-48 scopeNotes must mention proxy tags, supported protocols, ID formats, and arbitrary event kinds'
    );
  }
  if (/not-started|pending|proxy tags pending/i.test(`${entry.status} ${entry.scopeNotes}`)) {
    errors.push('NIP-48 scopeNotes must not use stale proxy-tag-pending wording');
  }
  return errors;
}

function validateNip50MatrixEntry(entry: NipMatrixEntry): string[] {
  const errors: string[] = [];
  if (entry.status !== 'implemented') {
    errors.push('NIP-50 must stay implemented after search filter helper coverage');
  }
  if (entry.owner !== REQUIRED_NIP50_OWNER) {
    errors.push(`NIP-50 owner must be ${REQUIRED_NIP50_OWNER}`);
  }
  if (entry.proof !== REQUIRED_NIP50_PROOF) {
    errors.push(`NIP-50 proof must be ${REQUIRED_NIP50_PROOF}`);
  }
  if (
    !/search filter|search field/i.test(entry.scopeNotes) ||
    !/(supported_nips|supported nips|NIP-11|relay support)/i.test(entry.scopeNotes) ||
    !/(extension|include:spam|domain|language|sentiment|nsfw)/i.test(entry.scopeNotes)
  ) {
    errors.push(
      'NIP-50 scopeNotes must mention search filters, relay support detection, and query extensions'
    );
  }
  if (
    /not-started|pending|search capability pending/i.test(`${entry.status} ${entry.scopeNotes}`)
  ) {
    errors.push('NIP-50 scopeNotes must not use stale search-pending wording');
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

function validateNip52MatrixEntry(entry: NipMatrixEntry): string[] {
  const errors: string[] = [];
  if (entry.status !== 'implemented') {
    errors.push('NIP-52 must stay implemented after calendar event helper coverage');
  }
  if (entry.owner !== REQUIRED_NIP52_OWNER) {
    errors.push(`NIP-52 owner must be ${REQUIRED_NIP52_OWNER}`);
  }
  if (entry.proof !== REQUIRED_NIP52_PROOF) {
    errors.push(`NIP-52 proof must be ${REQUIRED_NIP52_PROOF}`);
  }
  if (
    !/(31922|31923|date-based|time-based)/i.test(entry.scopeNotes) ||
    !/(31924|calendar)/i.test(entry.scopeNotes) ||
    !/(31925|RSVP|status|free\/busy)/i.test(entry.scopeNotes) ||
    !/(D tag|day|timezone|tzid|a tag|address)/i.test(entry.scopeNotes)
  ) {
    errors.push(
      'NIP-52 scopeNotes must mention date/time events, calendars, RSVPs, D/tzid/address tags'
    );
  }
  if (/not-started|pending|outside current scope/i.test(`${entry.status} ${entry.scopeNotes}`)) {
    errors.push('NIP-52 scopeNotes must not use stale calendar-out-of-scope wording');
  }
  return errors;
}

function validateNip53MatrixEntry(entry: NipMatrixEntry): string[] {
  const errors: string[] = [];
  if (entry.status !== 'implemented') {
    errors.push('NIP-53 must stay implemented after live-activity helper coverage');
  }
  if (entry.owner !== REQUIRED_NIP53_OWNER) {
    errors.push(`NIP-53 owner must be ${REQUIRED_NIP53_OWNER}`);
  }
  if (entry.proof !== REQUIRED_NIP53_PROOF) {
    errors.push(`NIP-53 proof must be ${REQUIRED_NIP53_PROOF}`);
  }
  if (
    !/(30311|live stream|live activity)/i.test(entry.scopeNotes) ||
    !/(1311|live chat)/i.test(entry.scopeNotes) ||
    !/(30312|meeting space)/i.test(entry.scopeNotes) ||
    !/(30313|meeting room)/i.test(entry.scopeNotes) ||
    !/(10312|presence|hand)/i.test(entry.scopeNotes) ||
    !/(status|participant|relays|address)/i.test(entry.scopeNotes)
  ) {
    errors.push(
      'NIP-53 scopeNotes must mention live streams, chat, meeting space/room, presence, and shared tags'
    );
  }
  if (/not-started|pending|outside current scope/i.test(`${entry.status} ${entry.scopeNotes}`)) {
    errors.push('NIP-53 scopeNotes must not use stale live-activity-out-of-scope wording');
  }
  return errors;
}

function validateNip55MatrixEntry(entry: NipMatrixEntry): string[] {
  const errors: string[] = [];
  if (entry.status !== 'implemented') {
    errors.push('NIP-55 must stay implemented after Android signer helper coverage');
  }
  if (entry.owner !== REQUIRED_NIP55_OWNER) {
    errors.push(`NIP-55 owner must be ${REQUIRED_NIP55_OWNER}`);
  }
  if (entry.proof !== REQUIRED_NIP55_PROOF) {
    errors.push(`NIP-55 proof must be ${REQUIRED_NIP55_PROOF}`);
  }
  if (
    !/(Android signer|nostrsigner)/i.test(entry.scopeNotes) ||
    !/(intent|content resolver|callback)/i.test(entry.scopeNotes) ||
    !/(permission|rejected|result)/i.test(entry.scopeNotes)
  ) {
    errors.push(
      'NIP-55 scopeNotes must mention Android signer nostrsigner URLs, intent/content resolver flows, and result handling'
    );
  }
  if (
    /not-started|pending|Android signer integration pending/i.test(
      `${entry.status} ${entry.scopeNotes}`
    )
  ) {
    errors.push('NIP-55 scopeNotes must not use stale Android-signer-pending wording');
  }
  return errors;
}

function validateNip56MatrixEntry(entry: NipMatrixEntry): string[] {
  const errors: string[] = [];
  if (entry.status !== 'implemented') {
    errors.push('NIP-56 must stay implemented after core report model coverage');
  }
  if (entry.owner !== REQUIRED_NIP56_OWNER) {
    errors.push(`NIP-56 owner must be ${REQUIRED_NIP56_OWNER}`);
  }
  if (entry.proof !== REQUIRED_NIP56_PROOF) {
    errors.push(`NIP-56 proof must be ${REQUIRED_NIP56_PROOF}`);
  }
  if (
    !/kind:1984|1984/i.test(entry.scopeNotes) ||
    !/(report type|typed)/i.test(entry.scopeNotes) ||
    !/(p|e|x).*tag/i.test(entry.scopeNotes)
  ) {
    errors.push('NIP-56 scopeNotes must mention kind:1984 typed p/e/x report tags');
  }
  if (/not-started|pending|reporting model pending/i.test(`${entry.status} ${entry.scopeNotes}`)) {
    errors.push('NIP-56 scopeNotes must not use stale reporting-pending wording');
  }
  return errors;
}

function validateNip58MatrixEntry(entry: NipMatrixEntry): string[] {
  const errors: string[] = [];
  if (entry.status !== 'implemented') {
    errors.push('NIP-58 must stay implemented after badge helper coverage');
  }
  if (entry.owner !== REQUIRED_NIP58_OWNER) {
    errors.push(`NIP-58 owner must be ${REQUIRED_NIP58_OWNER}`);
  }
  if (entry.proof !== REQUIRED_NIP58_PROOF) {
    errors.push(`NIP-58 proof must be ${REQUIRED_NIP58_PROOF}`);
  }
  if (
    !/(30009|badge definition)/i.test(entry.scopeNotes) ||
    !/(kind:8|badge award)/i.test(entry.scopeNotes) ||
    !/(10008|profile badges)/i.test(entry.scopeNotes) ||
    !/(30008|badge set|deprecated)/i.test(entry.scopeNotes) ||
    !/(ordered|a\/e pair|thumbnail|image)/i.test(entry.scopeNotes)
  ) {
    errors.push(
      'NIP-58 scopeNotes must mention badge definitions, awards, profile badges, badge sets, and ordered a/e pairs'
    );
  }
  if (/not-started|pending|badges pending/i.test(`${entry.status} ${entry.scopeNotes}`)) {
    errors.push('NIP-58 scopeNotes must not use stale badge-pending wording');
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

function validateNip62MatrixEntry(entry: NipMatrixEntry): string[] {
  const errors: string[] = [];
  if (entry.status !== 'implemented') {
    errors.push('NIP-62 must stay implemented after request-to-vanish retention coverage');
  }
  if (entry.owner !== REQUIRED_NIP62_OWNER) {
    errors.push(`NIP-62 owner must be ${REQUIRED_NIP62_OWNER}`);
  }
  if (entry.proof !== REQUIRED_NIP62_PROOF) {
    errors.push(`NIP-62 proof must be ${REQUIRED_NIP62_PROOF}`);
  }
  if (
    !/kind:62|request-to-vanish|vanish/i.test(entry.scopeNotes) ||
    !/(relay|ALL_RELAYS)/i.test(entry.scopeNotes) ||
    !/(cutoff|suppression|NIP-09|NIP-59|gift-wrap)/i.test(entry.scopeNotes)
  ) {
    errors.push(
      'NIP-62 scopeNotes must mention kind:62 vanish requests, relay targets, and retention cleanup'
    );
  }
  if (
    /not-started|pending|retention handling pending/i.test(`${entry.status} ${entry.scopeNotes}`)
  ) {
    errors.push('NIP-62 scopeNotes must not use stale retention-pending wording');
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

function validateNip68MatrixEntry(entry: NipMatrixEntry): string[] {
  const errors: string[] = [];
  if (entry.status !== 'implemented') {
    errors.push('NIP-68 must stay implemented after picture event helper coverage');
  }
  if (entry.owner !== REQUIRED_NIP68_OWNER) {
    errors.push(`NIP-68 owner must be ${REQUIRED_NIP68_OWNER}`);
  }
  if (entry.proof !== REQUIRED_NIP68_PROOF) {
    errors.push(`NIP-68 proof must be ${REQUIRED_NIP68_PROOF}`);
  }
  if (
    !/(kind:20|picture)/i.test(entry.scopeNotes) ||
    !/imeta/i.test(entry.scopeNotes) ||
    !/(media type|image\/jpeg|image\/webp)/i.test(entry.scopeNotes) ||
    !/(annotate-user|fallback|content-warning|location|geohash)/i.test(entry.scopeNotes)
  ) {
    errors.push(
      'NIP-68 scopeNotes must mention kind:20 picture events, imeta images, accepted media types, and related picture tags'
    );
  }
  if (
    /not-started|pending|picture-first feeds pending/i.test(`${entry.status} ${entry.scopeNotes}`)
  ) {
    errors.push('NIP-68 scopeNotes must not use stale picture-feed-pending wording');
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

function validateNip71MatrixEntry(entry: NipMatrixEntry): string[] {
  const errors: string[] = [];
  if (entry.status !== 'implemented') {
    errors.push('NIP-71 must stay implemented after video event helper coverage');
  }
  if (entry.owner !== REQUIRED_NIP71_OWNER) {
    errors.push(`NIP-71 owner must be ${REQUIRED_NIP71_OWNER}`);
  }
  if (entry.proof !== REQUIRED_NIP71_PROOF) {
    errors.push(`NIP-71 proof must be ${REQUIRED_NIP71_PROOF}`);
  }
  if (
    !/(kind:21|kind:22|34235|34236)/i.test(entry.scopeNotes) ||
    !/imeta/i.test(entry.scopeNotes) ||
    !/(duration|bitrate|text-track|segment|origin)/i.test(entry.scopeNotes) ||
    !/(addressable|d tag)/i.test(entry.scopeNotes)
  ) {
    errors.push(
      'NIP-71 scopeNotes must mention video kinds, addressable d tags, imeta variants, and video metadata tags'
    );
  }
  if (
    /not-started|pending|outside current scope|video events outside/i.test(
      `${entry.status} ${entry.scopeNotes}`
    )
  ) {
    errors.push('NIP-71 scopeNotes must not use stale video-out-of-scope wording');
  }
  return errors;
}

function validateNip72MatrixEntry(entry: NipMatrixEntry): string[] {
  const errors: string[] = [];
  if (entry.status !== 'implemented') {
    errors.push('NIP-72 must stay implemented after moderated community helper coverage');
  }
  if (entry.owner !== REQUIRED_NIP72_OWNER) {
    errors.push(`NIP-72 owner must be ${REQUIRED_NIP72_OWNER}`);
  }
  if (entry.proof !== REQUIRED_NIP72_PROOF) {
    errors.push(`NIP-72 proof must be ${REQUIRED_NIP72_PROOF}`);
  }
  if (
    !/(34550|community definition)/i.test(entry.scopeNotes) ||
    !/(4550|approval)/i.test(entry.scopeNotes) ||
    !/(1111|NIP-22|post tag)/i.test(entry.scopeNotes) ||
    !/(moderator|relay)/i.test(entry.scopeNotes)
  ) {
    errors.push(
      'NIP-72 scopeNotes must mention community definitions, moderators/relays, community post tags, and approvals'
    );
  }
  if (
    /not-started|pending|moderated communities pending/i.test(`${entry.status} ${entry.scopeNotes}`)
  ) {
    errors.push('NIP-72 scopeNotes must not use stale community-pending wording');
  }
  return errors;
}

function validateNip78MatrixEntry(entry: NipMatrixEntry): string[] {
  const errors: string[] = [];
  if (entry.status !== 'implemented') {
    errors.push('NIP-78 must stay implemented after application data model coverage');
  }
  if (entry.owner !== REQUIRED_NIP78_OWNER) {
    errors.push(`NIP-78 owner must be ${REQUIRED_NIP78_OWNER}`);
  }
  if (entry.proof !== REQUIRED_NIP78_PROOF) {
    errors.push(`NIP-78 proof must be ${REQUIRED_NIP78_PROOF}`);
  }
  if (!/30078|addressable/i.test(entry.scopeNotes) || !/d tag/i.test(entry.scopeNotes)) {
    errors.push('NIP-78 scopeNotes must mention kind:30078 addressable events and d tags');
  }
  if (
    /not-started|pending|application-specific data pending/i.test(
      `${entry.status} ${entry.scopeNotes}`
    )
  ) {
    errors.push('NIP-78 scopeNotes must not use stale application-data-pending wording');
  }
  return errors;
}

function validateNip7dMatrixEntry(entry: NipMatrixEntry): string[] {
  const errors: string[] = [];
  if (entry.status !== 'implemented') {
    errors.push('NIP-7D must stay implemented after thread model coverage');
  }
  if (entry.owner !== REQUIRED_NIP7D_OWNER) {
    errors.push(`NIP-7D owner must be ${REQUIRED_NIP7D_OWNER}`);
  }
  if (entry.proof !== REQUIRED_NIP7D_PROOF) {
    errors.push(`NIP-7D proof must be ${REQUIRED_NIP7D_PROOF}`);
  }
  if (
    !/kind:11|kind 11|thread/i.test(entry.scopeNotes) ||
    !/(title|root)/i.test(entry.scopeNotes) ||
    !/(NIP-22|1111|comment)/i.test(entry.scopeNotes)
  ) {
    errors.push(
      'NIP-7D scopeNotes must mention kind:11 threads, title/root tags, and NIP-22 comments'
    );
  }
  if (/not-started|pending|threads model pending/i.test(`${entry.status} ${entry.scopeNotes}`)) {
    errors.push('NIP-7D scopeNotes must not use stale thread-pending wording');
  }
  return errors;
}

function validateNip84MatrixEntry(entry: NipMatrixEntry): string[] {
  const errors: string[] = [];
  if (entry.status !== 'implemented') {
    errors.push('NIP-84 must stay implemented after highlight event helper coverage');
  }
  if (entry.owner !== REQUIRED_NIP84_OWNER) {
    errors.push(`NIP-84 owner must be ${REQUIRED_NIP84_OWNER}`);
  }
  if (entry.proof !== REQUIRED_NIP84_PROOF) {
    errors.push(`NIP-84 proof must be ${REQUIRED_NIP84_PROOF}`);
  }
  if (
    !/(9802|highlight)/i.test(entry.scopeNotes) ||
    !/(source|reference|e\/a\/r)/i.test(entry.scopeNotes) ||
    !/(author|editor|attribution|p-tag)/i.test(entry.scopeNotes) ||
    !/(context|comment|mention)/i.test(entry.scopeNotes)
  ) {
    errors.push(
      'NIP-84 scopeNotes must mention kind:9802 highlights, source references, attribution p-tags, and context/comment mentions'
    );
  }
  if (/not-started|pending|highlights pending/i.test(`${entry.status} ${entry.scopeNotes}`)) {
    errors.push('NIP-84 scopeNotes must not use stale highlight-pending wording');
  }
  return errors;
}

function validateNip85MatrixEntry(entry: NipMatrixEntry): string[] {
  const errors: string[] = [];
  if (entry.status !== 'implemented') {
    errors.push('NIP-85 must stay implemented after trusted assertion helper coverage');
  }
  if (entry.owner !== REQUIRED_NIP85_OWNER) {
    errors.push(`NIP-85 owner must be ${REQUIRED_NIP85_OWNER}`);
  }
  if (entry.proof !== REQUIRED_NIP85_PROOF) {
    errors.push(`NIP-85 proof must be ${REQUIRED_NIP85_PROOF}`);
  }
  if (
    !/(30382|30383|30384|30385)/i.test(entry.scopeNotes) ||
    !/(addressable|d tag|subject)/i.test(entry.scopeNotes) ||
    !/(result tag|rank|followers|zap)/i.test(entry.scopeNotes) ||
    !/(10040|provider)/i.test(entry.scopeNotes) ||
    !/(NIP-73|k tag)/i.test(entry.scopeNotes)
  ) {
    errors.push(
      'NIP-85 scopeNotes must mention assertion kinds, d-tag subjects, result tags, NIP-73 k tags, and kind:10040 providers'
    );
  }
  if (
    /not-started|pending|trusted assertions pending/i.test(`${entry.status} ${entry.scopeNotes}`)
  ) {
    errors.push('NIP-85 scopeNotes must not use stale trusted-assertion-pending wording');
  }
  return errors;
}

function validateNip86MatrixEntry(entry: NipMatrixEntry): string[] {
  const errors: string[] = [];
  if (entry.status !== 'implemented') {
    errors.push('NIP-86 must stay implemented after relay management helper coverage');
  }
  if (entry.owner !== REQUIRED_NIP86_OWNER) {
    errors.push(`NIP-86 owner must be ${REQUIRED_NIP86_OWNER}`);
  }
  if (entry.proof !== REQUIRED_NIP86_PROOF) {
    errors.push(`NIP-86 proof must be ${REQUIRED_NIP86_PROOF}`);
  }
  if (
    !/(relay management|JSON-RPC|application\/nostr\+json\+rpc)/i.test(entry.scopeNotes) ||
    !/(supportedmethods|banpubkey|allowevent|allowkind|blockip)/i.test(entry.scopeNotes) ||
    !/(NIP-98|payload|Authorization)/i.test(entry.scopeNotes) ||
    !/(HTTP|POST|request|response)/i.test(entry.scopeNotes)
  ) {
    errors.push(
      'NIP-86 scopeNotes must mention relay management JSON-RPC, standard methods, NIP-98 payload Authorization, and HTTP request/response helpers'
    );
  }
  if (
    /not-started|pending|outside current client runtime/i.test(
      `${entry.status} ${entry.scopeNotes}`
    )
  ) {
    errors.push('NIP-86 scopeNotes must not use stale outside-client-runtime wording');
  }
  return errors;
}

function validateNip88MatrixEntry(entry: NipMatrixEntry): string[] {
  const errors: string[] = [];
  if (entry.status !== 'implemented') {
    errors.push('NIP-88 must stay implemented after poll helper coverage');
  }
  if (entry.owner !== REQUIRED_NIP88_OWNER) {
    errors.push(`NIP-88 owner must be ${REQUIRED_NIP88_OWNER}`);
  }
  if (entry.proof !== REQUIRED_NIP88_PROOF) {
    errors.push(`NIP-88 proof must be ${REQUIRED_NIP88_PROOF}`);
  }
  if (
    !/(kind:1068|1068|poll)/i.test(entry.scopeNotes) ||
    !/(kind:1018|1018|response|vote)/i.test(entry.scopeNotes) ||
    !/(option|relay|polltype|endsAt)/i.test(entry.scopeNotes) ||
    !/(singlechoice|multiplechoice|latest|pubkey|tally)/i.test(entry.scopeNotes)
  ) {
    errors.push(
      'NIP-88 scopeNotes must mention poll/response kinds, option/relay/polltype/endsAt tags, and latest vote tally helpers'
    );
  }
  if (/not-started|pending|polls pending/i.test(`${entry.status} ${entry.scopeNotes}`)) {
    errors.push('NIP-88 scopeNotes must not use stale poll-pending wording');
  }
  return errors;
}

function validateNip89MatrixEntry(entry: NipMatrixEntry): string[] {
  const errors: string[] = [];
  if (entry.status !== 'implemented') {
    errors.push('NIP-89 must stay implemented after application handler helper coverage');
  }
  if (entry.owner !== REQUIRED_NIP89_OWNER) {
    errors.push(`NIP-89 owner must be ${REQUIRED_NIP89_OWNER}`);
  }
  if (entry.proof !== REQUIRED_NIP89_PROOF) {
    errors.push(`NIP-89 proof must be ${REQUIRED_NIP89_PROOF}`);
  }
  if (
    !/(31989|recommendation)/i.test(entry.scopeNotes) ||
    !/(31990|handler information)/i.test(entry.scopeNotes) ||
    !/(d tag|k tag|a tag|supported kind)/i.test(entry.scopeNotes) ||
    !/(client tag|filter|URL template|platform)/i.test(entry.scopeNotes)
  ) {
    errors.push(
      'NIP-89 scopeNotes must mention recommendations, handler information, d/k/a tags, client tags, and filters/templates'
    );
  }
  if (
    /not-started|pending|recommended handlers pending/i.test(`${entry.status} ${entry.scopeNotes}`)
  ) {
    errors.push('NIP-89 scopeNotes must not use stale handler-pending wording');
  }
  return errors;
}

function validateNip92MatrixEntry(entry: NipMatrixEntry): string[] {
  const errors: string[] = [];
  if (entry.status !== 'implemented') {
    errors.push('NIP-92 must stay implemented after media attachment helper coverage');
  }
  if (entry.owner !== REQUIRED_NIP92_OWNER) {
    errors.push(`NIP-92 owner must be ${REQUIRED_NIP92_OWNER}`);
  }
  if (entry.proof !== REQUIRED_NIP92_PROOF) {
    errors.push(`NIP-92 proof must be ${REQUIRED_NIP92_PROOF}`);
  }
  if (
    !/imeta/i.test(entry.scopeNotes) ||
    !/(inline content URL|content-match|content URL)/i.test(entry.scopeNotes) ||
    !/(NIP-94|m\/x\/ox|file metadata)/i.test(entry.scopeNotes) ||
    !/(fallback|alt|blurhash|thumb|image)/i.test(entry.scopeNotes) ||
    !/(one-imeta|dedup|unique)/i.test(entry.scopeNotes)
  ) {
    errors.push(
      'NIP-92 scopeNotes must mention imeta content URLs, NIP-94 file metadata fields, media preview/fallback fields, and URL dedupe helpers'
    );
  }
  if (
    /not-started|pending|media attachments pending/i.test(`${entry.status} ${entry.scopeNotes}`)
  ) {
    errors.push('NIP-92 scopeNotes must not use stale media-attachment-pending wording');
  }
  return errors;
}

function validateNip94MatrixEntry(entry: NipMatrixEntry): string[] {
  const errors: string[] = [];
  if (entry.status !== 'implemented') {
    errors.push('NIP-94 must stay implemented after file metadata helper coverage');
  }
  if (entry.owner !== REQUIRED_NIP94_OWNER) {
    errors.push(`NIP-94 owner must be ${REQUIRED_NIP94_OWNER}`);
  }
  if (entry.proof !== REQUIRED_NIP94_PROOF) {
    errors.push(`NIP-94 proof must be ${REQUIRED_NIP94_PROOF}`);
  }
  if (
    !/(kind:1063|1063|file metadata)/i.test(entry.scopeNotes) ||
    !/(url|m\/x|SHA-256|media type)/i.test(entry.scopeNotes) ||
    !/(ox|size|dim|magnet|blurhash)/i.test(entry.scopeNotes) ||
    !/(thumb|image|summary|alt|fallback|service)/i.test(entry.scopeNotes) ||
    !/(filter|#x|#m)/i.test(entry.scopeNotes)
  ) {
    errors.push(
      'NIP-94 scopeNotes must mention kind:1063, required URL/media/hash tags, file metadata tags, preview/fallback fields, and hash/media filters'
    );
  }
  if (/not-started|pending|file metadata pending/i.test(`${entry.status} ${entry.scopeNotes}`)) {
    errors.push('NIP-94 scopeNotes must not use stale file-metadata-pending wording');
  }
  return errors;
}

function validateNip98MatrixEntry(entry: NipMatrixEntry): string[] {
  const errors: string[] = [];
  if (entry.status !== 'implemented') {
    errors.push('NIP-98 must stay implemented after HTTP auth helper coverage');
  }
  if (entry.owner !== REQUIRED_NIP98_OWNER) {
    errors.push(`NIP-98 owner must be ${REQUIRED_NIP98_OWNER}`);
  }
  if (entry.proof !== REQUIRED_NIP98_PROOF) {
    errors.push(`NIP-98 proof must be ${REQUIRED_NIP98_PROOF}`);
  }
  if (
    !/27235|HTTP auth/i.test(entry.scopeNotes) ||
    !/Authorization|Nostr/i.test(entry.scopeNotes) ||
    !/(payload|SHA-256)/i.test(entry.scopeNotes)
  ) {
    errors.push(
      'NIP-98 scopeNotes must mention kind:27235 HTTP auth, Nostr Authorization, and payload hash coverage'
    );
  }
  if (/not-started|pending|http auth pending/i.test(`${entry.status} ${entry.scopeNotes}`)) {
    errors.push('NIP-98 scopeNotes must not use stale HTTP-auth-pending wording');
  }
  return errors;
}

function validateNipA0MatrixEntry(entry: NipMatrixEntry): string[] {
  const errors: string[] = [];
  if (entry.status !== 'implemented') {
    errors.push('NIP-A0 must stay implemented after voice message helper coverage');
  }
  if (entry.owner !== REQUIRED_NIPA0_OWNER) {
    errors.push(`NIP-A0 owner must be ${REQUIRED_NIPA0_OWNER}`);
  }
  if (entry.proof !== REQUIRED_NIPA0_PROOF) {
    errors.push(`NIP-A0 proof must be ${REQUIRED_NIPA0_PROOF}`);
  }
  if (
    !/(1222|1244|voice)/i.test(entry.scopeNotes) ||
    !/(audio URL|audio\/mp4|duration)/i.test(entry.scopeNotes) ||
    !/(NIP-22|root|parent|reply)/i.test(entry.scopeNotes) ||
    !/(NIP-92|imeta|waveform)/i.test(entry.scopeNotes) ||
    !/(filter|relay)/i.test(entry.scopeNotes)
  ) {
    errors.push(
      'NIP-A0 scopeNotes must mention voice kinds, audio URL/duration metadata, NIP-22 reply tags, NIP-92 waveform imeta, and relay filters'
    );
  }
  if (/not-started|pending|voice messages pending/i.test(`${entry.status} ${entry.scopeNotes}`)) {
    errors.push('NIP-A0 scopeNotes must not use stale voice-message-pending wording');
  }
  return errors;
}

function validateNipA4MatrixEntry(entry: NipMatrixEntry): string[] {
  const errors: string[] = [];
  if (entry.status !== 'implemented') {
    errors.push('NIP-A4 must stay implemented after public message helper coverage');
  }
  if (entry.owner !== REQUIRED_NIPA4_OWNER) {
    errors.push(`NIP-A4 owner must be ${REQUIRED_NIPA4_OWNER}`);
  }
  if (entry.proof !== REQUIRED_NIPA4_PROOF) {
    errors.push(`NIP-A4 proof must be ${REQUIRED_NIPA4_PROOF}`);
  }
  if (
    !/(kind:24|24|public message)/i.test(entry.scopeNotes) ||
    !/(receiver|p-tag|p tag|#p)/i.test(entry.scopeNotes) ||
    !/(no e|e tag|forbid)/i.test(entry.scopeNotes) ||
    !/(expiration|NIP-40|q tag|NIP-18)/i.test(entry.scopeNotes) ||
    !/(NIP-92|imeta|attachment)/i.test(entry.scopeNotes) ||
    !/(filter|relay)/i.test(entry.scopeNotes)
  ) {
    errors.push(
      'NIP-A4 scopeNotes must mention kind:24 public messages, p receivers/#p filters, forbidden e tags, NIP-40/NIP-18 metadata, NIP-92 imeta, and relay filters'
    );
  }
  if (/not-started|pending|public messages pending/i.test(`${entry.status} ${entry.scopeNotes}`)) {
    errors.push('NIP-A4 scopeNotes must not use stale public-message-pending wording');
  }
  return errors;
}

function validateNipB7MatrixEntry(entry: NipMatrixEntry): string[] {
  const errors: string[] = [];
  if (entry.status !== 'implemented') {
    errors.push('NIP-B7 must stay implemented after Blossom helper coverage');
  }
  if (entry.owner !== REQUIRED_NIPB7_OWNER) {
    errors.push(`NIP-B7 owner must be ${REQUIRED_NIPB7_OWNER}`);
  }
  if (entry.proof !== REQUIRED_NIPB7_PROOF) {
    errors.push(`NIP-B7 proof must be ${REQUIRED_NIPB7_PROOF}`);
  }
  if (
    !/Blossom/i.test(entry.scopeNotes) ||
    !/(kind:10063|10063|server list)/i.test(entry.scopeNotes) ||
    !/(server tag|server tags)/i.test(entry.scopeNotes) ||
    !/(SHA-256|sha256|hash)/i.test(entry.scopeNotes) ||
    !/(URL|fallback|extension)/i.test(entry.scopeNotes) ||
    !/(verify|verification|content hash)/i.test(entry.scopeNotes) ||
    !/(filter|relay)/i.test(entry.scopeNotes) ||
    !/(upload|auth|transport|outside)/i.test(entry.scopeNotes)
  ) {
    errors.push(
      'NIP-B7 scopeNotes must mention Blossom kind:10063 server lists, server tags, SHA-256 URL hashes, extensions/fallbacks, content verification, filters, and upload/auth boundary'
    );
  }
  if (
    /not-started|pending|outside current core runtime/i.test(`${entry.status} ${entry.scopeNotes}`)
  ) {
    errors.push('NIP-B7 scopeNotes must not use stale Blossom-out-of-scope wording');
  }
  return errors;
}

function validateNipC0MatrixEntry(entry: NipMatrixEntry): string[] {
  const errors: string[] = [];
  if (entry.status !== 'implemented') {
    errors.push('NIP-C0 must stay implemented after code snippet helper coverage');
  }
  if (entry.owner !== REQUIRED_NIPC0_OWNER) {
    errors.push(`NIP-C0 owner must be ${REQUIRED_NIPC0_OWNER}`);
  }
  if (entry.proof !== REQUIRED_NIPC0_PROOF) {
    errors.push(`NIP-C0 proof must be ${REQUIRED_NIPC0_PROOF}`);
  }
  if (
    !/(kind:1337|1337|code snippet)/i.test(entry.scopeNotes) ||
    !/(content|code body|whitespace)/i.test(entry.scopeNotes) ||
    !/(language|l tag|#l)/i.test(entry.scopeNotes) ||
    !/(extension|name|runtime|license|dependency|dep|repo)/i.test(entry.scopeNotes) ||
    !/(filter|relay)/i.test(entry.scopeNotes)
  ) {
    errors.push(
      'NIP-C0 scopeNotes must mention kind:1337 code snippets, code content preservation, language/#l filters, metadata/dependencies/repo, and relay filters'
    );
  }
  if (/not-started|pending|code snippets pending/i.test(`${entry.status} ${entry.scopeNotes}`)) {
    errors.push('NIP-C0 scopeNotes must not use stale code-snippet-pending wording');
  }
  return errors;
}

function validateNipC7MatrixEntry(entry: NipMatrixEntry): string[] {
  const errors: string[] = [];
  if (entry.status !== 'implemented') {
    errors.push('NIP-C7 must stay implemented after chat helper coverage');
  }
  if (entry.owner !== REQUIRED_NIPC7_OWNER) {
    errors.push(`NIP-C7 owner must be ${REQUIRED_NIPC7_OWNER}`);
  }
  if (entry.proof !== REQUIRED_NIPC7_PROOF) {
    errors.push(`NIP-C7 proof must be ${REQUIRED_NIPC7_PROOF}`);
  }
  if (
    !/(kind:9|9|chat)/i.test(entry.scopeNotes) ||
    !/(reply|parent|q tag|quote)/i.test(entry.scopeNotes) ||
    !/(content|message)/i.test(entry.scopeNotes) ||
    !/(filter|relay|author)/i.test(entry.scopeNotes)
  ) {
    errors.push(
      'NIP-C7 scopeNotes must mention kind:9 chat messages, q-tag parent replies, message content, and relay/author filters'
    );
  }
  if (/not-started|pending|chats pending/i.test(`${entry.status} ${entry.scopeNotes}`)) {
    errors.push('NIP-C7 scopeNotes must not use stale chat-pending wording');
  }
  return errors;
}

function validateNip01MatrixEntry(entry: NipMatrixEntry): string[] {
  const errors: string[] = [];
  if (entry.status !== 'implemented') {
    errors.push('NIP-01 must stay implemented after runtime REQ/replay coverage');
  }
  if (entry.owner !== REQUIRED_NIP01_OWNER) {
    errors.push(`NIP-01 owner must be ${REQUIRED_NIP01_OWNER}`);
  }
  if (entry.proof !== REQUIRED_NIP01_PROOF) {
    errors.push(`NIP-01 proof must be ${REQUIRED_NIP01_PROOF}`);
  }
  if (!/(REQ|replay|EOSE|OK)/i.test(entry.scopeNotes)) {
    errors.push('NIP-01 scopeNotes must mention REQ, replay, EOSE, and OK coverage');
  }
  return errors;
}

function validateNip11MatrixEntry(entry: NipMatrixEntry): string[] {
  const errors: string[] = [];
  if (entry.status !== 'implemented') {
    errors.push('NIP-11 must stay implemented after runtime-only bounded support coverage');
  }
  if (entry.owner !== REQUIRED_NIP11_OWNER) {
    errors.push(`NIP-11 owner must be ${REQUIRED_NIP11_OWNER}`);
  }
  if (entry.proof !== REQUIRED_NIP11_PROOF) {
    errors.push(`NIP-11 proof must be ${REQUIRED_NIP11_PROOF}`);
  }
  if (!/(request-limit|shard queueing|reconnect replay|runtime-only)/i.test(entry.scopeNotes)) {
    errors.push(
      'NIP-11 scopeNotes must mention request limits, shard queueing, reconnect replay, and runtime-only support'
    );
  }
  if (/public relay metadata surface|broader NIP-11 discovery claim/i.test(entry.scopeNotes)) {
    errors.push('NIP-11 scopeNotes must not claim public relay metadata discovery');
  }
  return errors;
}

function validateNip65MatrixEntry(entry: NipMatrixEntry): string[] {
  const errors: string[] = [];
  if (entry.status !== 'implemented') {
    errors.push('NIP-65 must stay implemented after relay list read/write coverage');
  }
  if (entry.owner !== REQUIRED_NIP65_OWNER) {
    errors.push(`NIP-65 owner must be ${REQUIRED_NIP65_OWNER}`);
  }
  if (!entry.proof.includes(REQUIRED_NIP65_READ_PROOF)) {
    errors.push(`NIP-65 proof must include ${REQUIRED_NIP65_READ_PROOF}`);
  }
  if (
    !/kind:10002/i.test(entry.scopeNotes) ||
    !/kind:3/i.test(entry.scopeNotes) ||
    !/read path/i.test(entry.scopeNotes) ||
    !/write path/i.test(entry.scopeNotes)
  ) {
    errors.push(
      'NIP-65 scopeNotes must mention kind:10002 read path, kind:3 fallback, and write path coverage'
    );
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
