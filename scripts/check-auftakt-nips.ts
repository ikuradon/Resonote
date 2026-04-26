import { readFileSync } from 'node:fs';

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

function validateInventory(inventory: NipInventory): string[] {
  const errors: string[] = [];
  if (!inventory.sourceUrl) errors.push('Inventory missing sourceUrl');
  if (!inventory.sourceDate) errors.push('Inventory missing sourceDate');
  const seen = new Set<string>();
  for (const nip of inventory.nips) {
    if (seen.has(nip)) errors.push(`Duplicate inventory NIP-${nip}`);
    seen.add(nip);
    if (nip !== nip.toUpperCase()) errors.push(`Inventory NIP-${nip} is not uppercase normalized`);
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
  return errors;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const inventory = JSON.parse(
    readFileSync('docs/auftakt/nips-inventory.json', 'utf8')
  ) as NipInventory;
  const matrix = JSON.parse(readFileSync('docs/auftakt/nip-matrix.json', 'utf8')) as NipMatrix;
  const result = checkNipMatrix(inventory, matrix);
  if (!result.ok) {
    console.error(result.errors.join('\n'));
    process.exit(1);
  }
}
