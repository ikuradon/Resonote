import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));

function readCoreFile(name: string): string {
  return readFileSync(resolve(currentDir, name), 'utf8');
}

function stripCommentsAndWhitespace(source: string): string {
  return source
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, '');
}

describe('@auftakt/core module boundaries', () => {
  it('does not leave focused core modules as empty export stubs', () => {
    for (const filename of ['negentropy.ts', 'reconcile.ts', 'relay-request.ts', 'settlement.ts']) {
      expect(stripCommentsAndWhitespace(readCoreFile(filename))).not.toBe('export{};');
    }
  });

  it('keeps request-planning focused on higher-level runtime composition', () => {
    const source = readCoreFile('request-planning.ts');

    expect(source).not.toMatch(/export interface ReadSettlementReducerInput/);
    expect(source).not.toMatch(/export function reduceReadSettlement/);
    expect(source).not.toMatch(/export interface ReconcileEmission/);
    expect(source).not.toMatch(/export function reconcileReplaceableCandidates/);
    expect(source).not.toMatch(/export type NegentropyEventRef/);
    expect(source).not.toMatch(/export function createNegentropyRepairRequestKey/);
    expect(source).not.toMatch(/export function buildRequestExecutionPlan/);
  });

  it('uses explicit package-root exports instead of wildcard re-exports', () => {
    const source = readCoreFile('index.ts');

    expect(source).not.toMatch(/export\s+\*\s+from/);
    expect(source).toContain("from './settlement.js'");
    expect(source).toContain("from './reconcile.js'");
    expect(source).toContain("from './relay-request.js'");
    expect(source).toContain("from './negentropy.js'");
  });
});
