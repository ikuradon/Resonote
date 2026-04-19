import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { nostrOwnershipMatrix, ownershipClassifications } from './auftakt-ownership-matrix.mjs';

export const ROOT = 'src';
export const SOURCE_FILE = /\.(ts|svelte)$/;
export const TEST_FILE = /\.(test|spec)\.(ts|js|svelte)$/;

export const bannedImportPatterns = [
  {
    pattern: /^\$lib\/stores\/.+\.svelte\.js$/,
    reason: 'Use $shared/browser public owners instead of legacy $lib/stores.'
  },
  {
    pattern: /^\.{1,2}(?:\/[^'"]+)*\/stores\/.+\.svelte\.js$/,
    reason: 'Component-relative store imports are not allowed.'
  },
  {
    pattern: /^\$lib\/i18n\/(?:t|locales)\.js$/,
    reason: 'Use $shared/i18n public APIs instead of legacy $lib/i18n runtime paths.'
  },
  {
    pattern: /^\.{1,2}(?:\/[^'"]+)*\/i18n\/(?:t|locales)\.js$/,
    reason: 'Relative i18n runtime imports are not allowed.'
  }
];

export const gatewayCompatibilityImport = '$shared/nostr/gateway.js';

export const retiredAuftaktInternalImports = [
  '$shared/auftakt/comment-subscriptions.js',
  '$shared/auftakt/emoji-runtime.js'
];

export const SHARED_NOSTR_ROOT = 'src/shared/nostr';

/**
 * @param {string} dir
 * @param {{ includeTests?: boolean }} [options]
 * @returns {string[]}
 */
export function walk(dir, options = {}) {
  const entries = readdirSync(dir).sort();
  /** @type {string[]} */
  const files = [];

  for (const entry of entries) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...walk(path, options));
      continue;
    }
    if (!SOURCE_FILE.test(path) || (!options.includeTests && TEST_FILE.test(path))) continue;
    files.push(path);
  }

  return files;
}

/**
 * @param {string} [dir=SHARED_NOSTR_ROOT]
 * @returns {string[]}
 */
export function listSharedNostrFiles(dir = SHARED_NOSTR_ROOT) {
  return walk(dir, { includeTests: true });
}

/**
 * @param {string} source
 * @returns {string}
 */
export function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/**
 * @param {string} source
 * @returns {string[]}
 */
export function collectSpecifiers(source) {
  const stripped = stripComments(source);
  /** @type {Set<string>} */
  const specifiers = new Set();

  for (const match of stripped.matchAll(/^\s*(?:import|export)\s.+?\sfrom\s+['"]([^'"]+)['"]/gm)) {
    specifiers.add(match[1]);
  }

  for (const match of stripped.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    specifiers.add(match[1]);
  }

  return [...specifiers].sort();
}

/**
 * @param {string[]} sourceFiles
 * @returns {string[]}
 */
export function collectBannedImportViolations(sourceFiles) {
  /** @type {string[]} */
  const violations = [];

  for (const file of sourceFiles) {
    const source = readFileSync(file, 'utf8');
    const specifiers = collectSpecifiers(source);

    for (const specifier of specifiers) {
      for (const { pattern, reason } of bannedImportPatterns) {
        if (pattern.test(specifier)) {
          violations.push(`${file}: ${specifier} — ${reason}`);
        }
      }
    }
  }

  return violations;
}

/**
 * @param {string[]} sourceFiles
 * @returns {string[]}
 */
export function collectGatewayCompatibilityImportViolations(sourceFiles) {
  /** @type {string[]} */
  const violations = [];

  for (const file of sourceFiles) {
    const source = readFileSync(file, 'utf8');
    const specifiers = collectSpecifiers(source);
    if (!specifiers.includes(gatewayCompatibilityImport)) continue;

    violations.push(
      `${file}: ${gatewayCompatibilityImport} — gateway.ts has been retired; import the façade/bridge/private runtime module you actually need instead.`
    );
  }

  return violations;
}

/**
 * @param {string[]} sourceFiles
 * @returns {string[]}
 */
export function collectRetiredAuftaktInternalImportViolations(sourceFiles) {
  /** @type {string[]} */
  const violations = [];

  for (const file of sourceFiles) {
    const source = readFileSync(file, 'utf8');
    const specifiers = collectSpecifiers(source);

    for (const specifier of retiredAuftaktInternalImports) {
      if (specifiers.includes(specifier)) {
        violations.push(
          `${file}: ${specifier} — retired low-level Auftakt helpers must stay behind $shared/auftakt/resonote.js.`
        );
      }
    }
  }

  return violations;
}

/**
 * @param {string[]} sourceFiles
 * @returns {string[]}
 */
export function findGatewayImporters(sourceFiles) {
  return sourceFiles
    .filter((file) => {
      const source = readFileSync(file, 'utf8');
      return collectSpecifiers(source).includes(gatewayCompatibilityImport);
    })
    .sort();
}

const knownOwnershipClassifications = new Set(ownershipClassifications);

/**
 * @returns {{
 *   records: Array<{
 *     file: string;
 *     classification: string;
 *     owner: string;
 *     disposition: string;
 *     classified: boolean;
 *   }>;
 *   unclassifiedFiles: string[];
 *   orphanedEntries: string[];
 *   invalidEntries: string[];
 * }}
 */
export function collectSharedNostrOwnershipState() {
  const files = listSharedNostrFiles();
  const matrixFiles = Object.keys(nostrOwnershipMatrix).sort();
  const fileSet = new Set(files);
  /** @type {string[]} */
  const unclassifiedFiles = [];
  /** @type {string[]} */
  const invalidEntries = [];

  const records = files.map((file) => {
    /** @type {{ classification: string; owner: string; disposition: string } | undefined} */
    const entry = nostrOwnershipMatrix[file];
    const classification = entry?.classification ?? '';
    const owner = entry?.owner ?? '';
    const disposition = entry?.disposition ?? '';
    const classified =
      knownOwnershipClassifications.has(classification) &&
      owner.length > 0 &&
      disposition.length > 0;

    if (!entry) {
      unclassifiedFiles.push(file);
    } else if (!classified) {
      invalidEntries.push(
        `${file}: classification/owner/disposition must be non-empty and classification must be one of ${ownershipClassifications.join(', ')}`
      );
    }

    return {
      file,
      classification,
      owner,
      disposition,
      classified
    };
  });

  const orphanedEntries = matrixFiles.filter((file) => !fileSet.has(file));

  return {
    records,
    unclassifiedFiles,
    orphanedEntries,
    invalidEntries
  };
}
