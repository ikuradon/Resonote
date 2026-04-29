import { existsSync, readFileSync } from 'node:fs';

import {
  collectGatewayCompatibilityImportViolations,
  collectSharedNostrOwnershipState,
  collectSpecifiers,
  findGatewayImporters,
  ROOT,
  stripComments,
  TEST_FILE,
  walk
} from './auftakt-migration-guard.mjs';

function readOption(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

const report = readOption('--report');
const proof = process.argv.includes('--proof');
const semanticGuard = process.argv.includes('--semantic-guard');
const failOnUnauthorized = process.argv.includes('--fail-on-unauthorized');
const failOnUnclassified = process.argv.includes('--fail-on-unclassified');

const SPEC_PATH = 'docs/auftakt/spec.md';
const PARITY_PATH = 'docs/auftakt/parity.md';
const FACADE_PATH = 'src/shared/auftakt/resonote.ts';

// Source of truth for Task 1 canonical reconciliation.
// Include = foundation-derived gaps approved for this wave.
// Exclude = topics that must not be implied by docs/proof wording.
const canonicalScope = {
  include: [
    'requestKey/replay canonicalization',
    'typed relay/session observations',
    'ReadSettlement semantics',
    'reconcile/offline publish semantics',
    'internal-only negentropy sync/repair',
    'remaining targeted consumer cutover tracking',
    '@auftakt/runtime package split'
  ],
  exclude: ['unrelated UI refactors', 'raw app-facing negentropy APIs']
};

const forbiddenConsumerSpecifiers = ['$shared/nostr/gateway.js', '$shared/nostr/user-relays.js'];

const targetedConsumerScopes = [
  {
    name: 'comments',
    files: [
      'src/features/comments/application/comment-subscription.ts',
      'src/features/comments/ui/comment-view-model.svelte.ts'
    ]
  },
  {
    name: 'notifications',
    files: [
      'src/features/notifications/ui/notifications-view-model.svelte.ts',
      'src/features/notifications/ui/notification-feed-view-model.svelte.ts'
    ]
  },
  {
    name: 'profiles',
    files: ['src/features/profiles/application/profile-queries.ts']
  },
  {
    name: 'relays',
    files: [
      'src/features/relays/ui/relay-settings-view-model.svelte.ts',
      'src/shared/browser/relays.svelte.ts'
    ]
  },
  {
    name: 'bootstrap',
    files: ['src/app/bootstrap/init-app.ts']
  },
  {
    name: 'nip19',
    files: ['src/features/nip19-resolver/application/fetch-event.ts']
  },
  {
    name: 'content-resolution',
    files: walk('src/features/content-resolution')
  }
];

const residualLegacyAliasPolicies = [
  {
    file: 'src/shared/nostr/user-relays.ts',
    specifiers: ['$shared/nostr/user-relays.js'],
    allowedTestImporters: ['src/shared/nostr/user-relays.test.ts']
  }
];

const retiredCachedReadSpecifierPart = 'cached-' + 'query';

const semanticGuardPolicies = [
  {
    name: 'legacy-network-settled-flag',
    description: 'retired networkSettled contract flag',
    pattern: /\bnetworkSettled\b/g,
    allowedFiles: []
  },
  {
    name: 'legacy-cached-read-source-contract',
    description: 'retired source=loading|cache|relay contract',
    pattern:
      /source\??\s*:\s*'(loading|cache|relay)'|source\s*:\s*'loading'\s*\|\s*'cache'\s*\|\s*'relay'/g,
    allowedFiles: []
  },
  {
    name: 'legacy-boolean-settled-contract',
    description: 'retired boolean settled contract payload',
    pattern: /\bsettled\s*:\s*(true|false)\b/g,
    allowedFiles: []
  },
  {
    name: 'raw-negentropy-protocol',
    description: 'raw negentropy protocol literals',
    pattern: /NEG-(OPEN|MSG|CLOSE)/g,
    allowedFiles: [
      'packages/runtime/src/relay-session.ts',
      'packages/runtime/src/relay-session.contract.test.ts',
      'packages/runtime/src/negentropy-transport.contract.test.ts',
      'packages/runtime/src/relay-repair.ts',
      'packages/runtime/src/relay-repair.contract.test.ts'
    ]
  },
  {
    name: 'obsolete-auftakt-package-import',
    description: 'deleted Auftakt package imports',
    pattern: /@auftakt\/(timeline|adapter-relay)/g,
    allowedFiles: []
  },
  {
    name: 'direct-shared-nostr-consumer-import',
    description: 'direct $shared/nostr canonical imports outside façade/internal bridges',
    pattern: new RegExp(
      `\\$shared\\/nostr\\/(${retiredCachedReadSpecifierPart}|client|query|publish-signed)(?:\\.js)?`,
      'g'
    ),
    allowedFiles: [
      'src/shared/auftakt/resonote.ts',
      'src/shared/auftakt/cached-read.test.ts',
      'src/shared/auftakt/relay-capability.test.ts',
      'src/shared/nostr/materialized-latest.ts',
      'src/shared/nostr/materialized-latest.test.ts',
      'src/shared/nostr/relays-config.ts',
      'src/shared/nostr/relays-config.test.ts',
      'src/shared/nostr/user-relays.test.ts'
    ]
  }
];

function collectResidualLegacyAliasState() {
  const scanTargets = ['src', 'e2e', 'packages'];
  const files = scanTargets.flatMap((target) => walk(target, { includeTests: true }));
  const filesBySpecifier = files.map((file) => ({
    file,
    specifiers: collectSpecifiers(readFileSync(file, 'utf8'))
  }));

  const aliases = residualLegacyAliasPolicies.map((policy) => {
    const importers = filesBySpecifier
      .filter(({ specifiers }) =>
        policy.specifiers.some((specifier) => specifiers.includes(specifier))
      )
      .map(({ file }) => file)
      .sort();

    const productionImporters = importers.filter((file) => !TEST_FILE.test(file));
    const testImporters = importers.filter((file) => TEST_FILE.test(file));
    const unauthorizedTestImporters = testImporters.filter(
      (file) => !policy.allowedTestImporters.includes(file)
    );

    const violations = [
      ...productionImporters.map(
        (file) =>
          `${file}: ${policy.file} — production compatibility import is forbidden; migrate to $shared/auftakt/resonote.js or the direct bridge.`
      ),
      ...unauthorizedTestImporters.map(
        (file) =>
          `${file}: ${policy.file} — test-only residual imports must be explicitly allowlisted in migration proof policy.`
      )
    ];

    return {
      ...policy,
      importers,
      productionImporters,
      testImporters,
      unauthorizedTestImporters,
      violations,
      status: violations.length === 0 ? 'clear' : 'leaking'
    };
  });

  return {
    aliases,
    violations: aliases.flatMap((alias) => alias.violations)
  };
}

function collectTargetedConsumerState() {
  const scopes = targetedConsumerScopes.map((scope) => {
    const files = [...new Set(scope.files)].sort();
    const fileResults = files.map((file) => {
      const specifiers = collectSpecifiers(readFileSync(file, 'utf8'));
      const leaks = specifiers.filter((specifier) =>
        forbiddenConsumerSpecifiers.includes(specifier)
      );
      return { file, leaks };
    });

    const violations = fileResults.flatMap(({ file, leaks }) =>
      leaks.map(
        (specifier) =>
          `${file}: ${specifier} — remaining targeted consumer cutover must use $shared/auftakt/resonote.js or approved high-level package APIs.`
      )
    );

    return {
      name: scope.name,
      fileCount: files.length,
      fileResults,
      leakCount: violations.length,
      status: violations.length === 0 ? 'clear' : 'leaking',
      violations
    };
  });

  return {
    scopes,
    fileCount: scopes.reduce((sum, scope) => sum + scope.fileCount, 0),
    violations: scopes.flatMap((scope) => scope.violations)
  };
}

function collectSemanticGuardState() {
  const files = [
    ...new Set(['src', 'packages'].flatMap((target) => walk(target, { includeTests: true })))
  ].sort();

  const entries = semanticGuardPolicies.map((policy) => {
    const hits = files.flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      const count = [...source.matchAll(policy.pattern)].length;
      if (count === 0) return [];

      return [
        {
          file,
          count,
          allowed: policy.allowedFiles.includes(file)
        }
      ];
    });

    const violations = hits
      .filter((hit) => !hit.allowed)
      .map(
        (hit) =>
          `${hit.file}: semantic guard matched ${policy.name} (${policy.description}) ${hit.count} time(s)`
      );

    return {
      ...policy,
      hits,
      violations
    };
  });

  return {
    entries,
    violations: entries.flatMap((entry) => entry.violations)
  };
}

function parseViolationFiles(violations) {
  return violations.map((violation) => violation.split(':', 1)[0]).sort();
}

/**
 * @param {string} source
 * @param {string} startMarker
 * @param {string} endMarker
 * @returns {string}
 */
function sliceSection(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  if (start === -1) return '';
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (end === -1) return source.slice(start);
  return source.slice(start, end);
}

/**
 * @param {string} source
 * @returns {string[]}
 */
function extractFacadeValueExports(source) {
  const stripped = stripComments(source);
  /** @type {Set<string>} */
  const names = new Set();

  for (const match of stripped.matchAll(
    /^\s*export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*(?:<[^\n]+?>)?\s*\(/gm
  )) {
    names.add(match[1]);
  }

  for (const match of stripped.matchAll(
    /^\s*export\s+(?:const|let|var|class)\s+([A-Za-z0-9_]+)/gm
  )) {
    names.add(match[1]);
  }

  for (const match of stripped.matchAll(/^\s*export\s*\{([^}]+)\}\s*from\s*['"][^'"]+['"]/gm)) {
    const block = match[1];
    for (const rawEntry of block.split(',')) {
      const entry = rawEntry.trim();
      if (entry.length === 0 || entry.startsWith('type ')) continue;
      const aliasSplit = entry.split(/\s+as\s+/);
      const exportedName = (aliasSplit[1] ?? aliasSplit[0]).trim();
      if (exportedName.length > 0) {
        names.add(exportedName);
      }
    }
  }

  return [...names].sort();
}

/**
 * @param {string} specSource
 * @returns {string[]}
 */
function extractDocumentedSpecApiNames(specSource) {
  const section = sliceSection(specSource, '### 6.1 API サマリ', '### 6.2 Read API');
  /** @type {Set<string>} */
  const names = new Set();

  for (const line of section.split('\n')) {
    const match = line.match(/^\|\s*`([^`]+)`\s*\|/);
    if (match) {
      names.add(match[1]);
    }
  }

  return [...names].sort();
}

/**
 * @param {string} paritySource
 * @returns {string[]}
 */
function extractAllowlistedUndocumentedValueExports(paritySource) {
  /** @type {Set<string>} */
  const names = new Set();

  for (const line of paritySource.split('\n')) {
    const match = line.match(
      /^\|\s*`([^`]+)`\s*\|\s*`undocumented-but-allowed`\s*\|[\s\S]*\|\s*`allowlist`\s*\|\s*$/
    );
    if (match) {
      names.add(match[1]);
    }
  }

  return [...names].sort();
}

/**
 * @param {string} paritySource
 * @returns {string[]}
 */
function extractParityListedUndocumentedValueExports(paritySource) {
  const section = sliceSection(paritySource, '## 3.', '## 4.');
  /** @type {Set<string>} */
  const names = new Set();

  for (const line of section.split('\n')) {
    const match = line.match(/^\s*-\s*`([^`]+)`\s*\(Value\)\s*$/);
    if (match) {
      names.add(match[1]);
    }
  }

  return [...names].sort();
}

function collectFacadeParityState() {
  const specSource = readFileSync(SPEC_PATH, 'utf8');
  const paritySource = readFileSync(PARITY_PATH, 'utf8');
  const facadeSource = readFileSync(FACADE_PATH, 'utf8');

  const documentedApis = extractDocumentedSpecApiNames(specSource);
  const facadeValueExports = extractFacadeValueExports(facadeSource);
  const allowlistedUndocumentedExports = extractAllowlistedUndocumentedValueExports(paritySource);
  const parityListedUndocumentedExports = extractParityListedUndocumentedValueExports(paritySource);

  const missingDocumentedApis = documentedApis.filter((name) => !facadeValueExports.includes(name));
  const undocumentedFacadeExports = facadeValueExports.filter(
    (name) => !documentedApis.includes(name)
  );
  const undocumentedWithoutPolicy = undocumentedFacadeExports.filter(
    (name) => !allowlistedUndocumentedExports.includes(name)
  );
  const staleAllowlistEntries = allowlistedUndocumentedExports.filter(
    (name) => !undocumentedFacadeExports.includes(name)
  );
  const staleParitySurfaceEntries = parityListedUndocumentedExports.filter(
    (name) => !undocumentedFacadeExports.includes(name)
  );
  const paritySurfaceOmissions = undocumentedFacadeExports.filter(
    (name) => !parityListedUndocumentedExports.includes(name)
  );

  const violations = [
    ...missingDocumentedApis.map(
      (name) =>
        `${FACADE_PATH}: documented spec §6 API is missing from façade value exports: ${name}`
    ),
    ...undocumentedWithoutPolicy.map(
      (name) =>
        `${FACADE_PATH}: undocumented façade value export requires explicit policy/allowlist coverage: ${name}`
    ),
    ...staleAllowlistEntries.map(
      (name) =>
        `${PARITY_PATH}: allowlisted undocumented export no longer matches façade export inventory: ${name}`
    ),
    ...staleParitySurfaceEntries.map(
      (name) => `${PARITY_PATH}: undocumented surface list names non-exported façade value: ${name}`
    ),
    ...paritySurfaceOmissions.map(
      (name) => `${PARITY_PATH}: undocumented surface list omits façade value export: ${name}`
    )
  ];

  return {
    documentedApis,
    facadeValueExports,
    allowlistedUndocumentedExports,
    missingDocumentedApis,
    undocumentedFacadeExports,
    undocumentedWithoutPolicy,
    staleAllowlistEntries,
    parityListedUndocumentedExports,
    staleParitySurfaceEntries,
    paritySurfaceOmissions,
    violations
  };
}

/**
 * @param {string} specSource
 * @returns {Array<{ surface: string; testAnchor: string | null }>}
 */
function extractCompanionSurfaces(specSource) {
  const section = sliceSection(specSource, '### 13.3 境界スコープ・クロスウォーク', '\n---\n');
  /** @type {Array<{ surface: string; testAnchor: string | null }>} */
  const surfaces = [];

  for (const line of section.split('\n')) {
    if (!line.startsWith('|')) continue;
    const codeMatches = [...line.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
    const surface = codeMatches.find((value) => value.startsWith('src/'));
    if (!surface) continue;
    const testAnchor =
      codeMatches.find((value) => value.startsWith('src/') && value.endsWith('.test.ts')) ?? null;
    surfaces.push({ surface, testAnchor });
  }

  return surfaces;
}

/**
 * @param {ReturnType<typeof collectTargetedConsumerState>} consumerState
 */
function collectCompanionCoverageState(consumerState) {
  const specSource = readFileSync(SPEC_PATH, 'utf8');
  const companionSurfaces = extractCompanionSurfaces(specSource);
  const targetedFiles = new Set(
    consumerState.scopes.flatMap((scope) => scope.fileResults.map(({ file }) => file))
  );

  const entries = companionSurfaces.map(({ surface, testAnchor }) => {
    const coveredByTargetedScope = targetedFiles.has(surface);
    const surfaceExists = existsSync(surface);
    const testAnchorExists = testAnchor ? existsSync(testAnchor) : false;
    const status = coveredByTargetedScope && surfaceExists && testAnchorExists ? 'covered' : 'gap';
    return {
      surface,
      testAnchor,
      coveredByTargetedScope,
      surfaceExists,
      testAnchorExists,
      status
    };
  });

  const violations = entries.flatMap((entry) => {
    /** @type {string[]} */
    const rowViolations = [];

    if (!entry.surfaceExists) {
      rowViolations.push(
        `${entry.surface}: companion surface declared in spec §13.3 but file is missing`
      );
    }

    if (!entry.coveredByTargetedScope) {
      rowViolations.push(
        `${entry.surface}: companion surface declared in spec §13.3 is outside migration targeted consumer coverage`
      );
    }

    if (entry.testAnchor && !entry.testAnchorExists) {
      rowViolations.push(
        `${entry.surface}: companion test anchor declared in spec §13.3 is missing: ${entry.testAnchor}`
      );
    }

    return rowViolations;
  });

  return {
    entries,
    companionSurfaces,
    violations
  };
}

function collectDependencyDirectionViolations(files) {
  const violations = [];
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    if (file.startsWith('packages/core/')) {
      if (/@auftakt\/(runtime|resonote)/.test(source)) {
        violations.push(`${file}: core must not depend on runtime or resonote`);
      }
    }
    if (file.startsWith('packages/runtime/')) {
      if (/@auftakt\/resonote/.test(source)) {
        violations.push(`${file}: runtime must not depend on resonote`);
      }
    }
  }
  return violations;
}

const sourceFiles = walk(ROOT);
const unauthorizedImportViolations = collectGatewayCompatibilityImportViolations(sourceFiles);
const ownershipState = collectSharedNostrOwnershipState();
const consumerState = collectTargetedConsumerState();
const residualLegacyAliasState = collectResidualLegacyAliasState();
const facadeParityState = collectFacadeParityState();
const companionCoverageState = collectCompanionCoverageState(consumerState);
const semanticGuardState = collectSemanticGuardState();
const dependencyDirectionViolations = collectDependencyDirectionViolations([
  ...sourceFiles,
  ...walk('packages', { includeTests: true })
]);

const enforceUnauthorized = failOnUnauthorized || proof;
const enforceUnclassified = failOnUnclassified || proof;

const importHygieneViolations = enforceUnauthorized ? unauthorizedImportViolations : [];
const semanticViolations = semanticGuard ? semanticGuardState.violations : [];

const ownershipViolations = [...ownershipState.invalidEntries];
if (enforceUnclassified) {
  ownershipViolations.push(
    ...ownershipState.unclassifiedFiles.map((file) => `${file}: ownership matrix entry missing`)
  );
}
ownershipViolations.push(
  ...ownershipState.orphanedEntries.map(
    (file) => `${file}: ownership matrix entry does not match a current file`
  )
);

const violations = [
  ...importHygieneViolations,
  ...ownershipViolations,
  ...consumerState.violations,
  ...residualLegacyAliasState.violations,
  ...facadeParityState.violations,
  ...companionCoverageState.violations,
  ...semanticViolations,
  ...dependencyDirectionViolations
];

if (violations.length > 0) {
  console.error('Auftakt migration guard failed.\n');

  if (importHygieneViolations.length > 0) {
    console.error('Import hygiene violations:');
    for (const violation of importHygieneViolations) {
      console.error(`- ${violation}`);
    }
    console.error('');
  }

  if (ownershipViolations.length > 0) {
    console.error('Ownership matrix violations:');
    for (const violation of ownershipViolations) {
      console.error(`- ${violation}`);
    }
    console.error('');
  }

  if (consumerState.violations.length > 0) {
    console.error('Targeted consumer cutover violations:');
    for (const violation of consumerState.violations) {
      console.error(`- ${violation}`);
    }
    console.error('');
  }

  if (residualLegacyAliasState.violations.length > 0) {
    console.error('Residual legacy alias violations:');
    for (const violation of residualLegacyAliasState.violations) {
      console.error(`- ${violation}`);
    }
    console.error('');
  }

  if (facadeParityState.violations.length > 0) {
    console.error('Façade parity violations:');
    for (const violation of facadeParityState.violations) {
      console.error(`- ${violation}`);
    }
    console.error('');
  }

  if (companionCoverageState.violations.length > 0) {
    console.error('Companion coverage violations:');
    for (const violation of companionCoverageState.violations) {
      console.error(`- ${violation}`);
    }
    console.error('');
  }

  if (semanticViolations.length > 0) {
    console.error('Semantic guard violations:');
    for (const violation of semanticViolations) {
      console.error(`- ${violation}`);
    }
    console.error('');
  }

  if (dependencyDirectionViolations.length > 0) {
    console.error('Dependency direction violations:');
    for (const violation of dependencyDirectionViolations) {
      console.error(`- ${violation}`);
    }
    console.error('');
  }

  process.exit(1);
}

const importers = findGatewayImporters(sourceFiles);
const unauthorizedImporterFiles = parseViolationFiles(unauthorizedImportViolations);
const proofComplete =
  importHygieneViolations.length === 0 &&
  ownershipViolations.length === 0 &&
  consumerState.violations.length === 0 &&
  residualLegacyAliasState.violations.length === 0 &&
  facadeParityState.violations.length === 0 &&
  companionCoverageState.violations.length === 0;

if (proof) {
  console.log('--- AUFTAKT MIGRATION PROOF ---');
  console.log(`Status: ${proofComplete ? 'COMPLETE' : 'IN_PROGRESS'}`);
  console.log(`Date: ${new Date().toISOString()}`);
  console.log('');
  console.log('1. Import Hygiene');
  console.log(`   Gateway importers: ${importers.length}`);
  for (const file of importers) {
    console.log(`   - ${file}`);
  }
  console.log(`   Unauthorized importers: ${unauthorizedImporterFiles.length}`);
  for (const file of unauthorizedImporterFiles) {
    console.log(`   - ${file}`);
  }
  console.log('');
  console.log('2. Remaining Consumer Cutover');
  console.log(`   Status: ${consumerState.violations.length === 0 ? 'CLEAR' : 'LEAKING'}`);
  console.log(`   Targeted files: ${consumerState.fileCount}`);
  console.log(`   Consumer leak count: ${consumerState.violations.length}`);
  for (const scope of consumerState.scopes) {
    console.log(
      `   scope=${scope.name} status=${scope.status} files=${scope.fileCount} leaks=${scope.leakCount}`
    );
  }
  console.log(`   Residual alias violations: ${residualLegacyAliasState.violations.length}`);
  for (const alias of residualLegacyAliasState.aliases) {
    console.log(
      `   alias-file=${alias.file} status=${alias.status} importers=${alias.importers.length} production=${alias.productionImporters.length} unauthorized-test=${alias.unauthorizedTestImporters.length}`
    );
  }
  console.log('');
  console.log('3. Façade Parity');
  console.log(`   Documented spec §6 APIs: ${facadeParityState.documentedApis.length}`);
  console.log(`   Façade value exports: ${facadeParityState.facadeValueExports.length}`);
  console.log(`   Missing documented APIs: ${facadeParityState.missingDocumentedApis.length}`);
  console.log(
    `   Undocumented façade exports: ${facadeParityState.undocumentedFacadeExports.length}`
  );
  console.log(
    `   Allowlisted undocumented exports: ${facadeParityState.allowlistedUndocumentedExports.length}`
  );
  for (const name of facadeParityState.missingDocumentedApis) {
    console.log(`   missing=${name}`);
  }
  for (const name of facadeParityState.undocumentedWithoutPolicy) {
    console.log(`   undocumented-without-policy=${name}`);
  }
  console.log('');
  console.log('4. Companion Coverage');
  console.log(`   Surfaces in spec §13.3: ${companionCoverageState.entries.length}`);
  console.log(`   Coverage violations: ${companionCoverageState.violations.length}`);
  for (const entry of companionCoverageState.entries) {
    console.log(
      `   surface=${entry.surface} status=${entry.status} targeted=${entry.coveredByTargetedScope} file=${entry.surfaceExists} test=${entry.testAnchorExists}`
    );
  }
  console.log('');
  console.log('5. Ownership Completeness');
  console.log(`   Ownership records: ${ownershipState.records.length}`);
  console.log(`   Unclassified files: ${ownershipState.unclassifiedFiles.length}`);
  console.log(`   Invalid entries: ${ownershipState.invalidEntries.length}`);
  console.log(`   Stale matrix entries: ${ownershipState.orphanedEntries.length}`);
  const counts = ownershipState.records.reduce((acc, record) => {
    acc[record.classification] = (acc[record.classification] || 0) + 1;
    return acc;
  }, {});
  for (const [classification, count] of Object.entries(counts)) {
    console.log(`   classification=${classification} count=${count}`);
  }
  console.log('-------------------------------');
} else if (report === 'ownership') {
  console.log(`Ownership records (${ownershipState.records.length}):`);
  for (const record of ownershipState.records) {
    console.log(
      `- ${record.file} | ${record.classification} | ${record.owner} | ${record.disposition}`
    );
  }
  console.log(`Unclassified files: ${ownershipState.unclassifiedFiles.length}`);
  console.log(`Stale matrix entries: ${ownershipState.orphanedEntries.length}`);
} else if (report === 'consumers') {
  console.log('Remaining targeted consumer cutover report:');
  console.log(
    `Interpretation: façade surface is canonical; FAIL means residual cutover work remains in targeted scopes.`
  );
  console.log(`Included scope: ${canonicalScope.include.join(' | ')}`);
  console.log(`Excluded scope: ${canonicalScope.exclude.join(' | ')}`);
  console.log(`Status: ${consumerState.violations.length === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`Scopes: ${consumerState.scopes.length}`);
  console.log(`Files: ${consumerState.fileCount}`);
  console.log(`Violations: ${consumerState.violations.length}`);
  for (const scope of consumerState.scopes) {
    console.log(
      `scope=${scope.name} status=${scope.status} files=${scope.fileCount} leaks=${scope.leakCount}`
    );
    for (const { file, leaks } of scope.fileResults) {
      console.log(
        `file=${file} status=${leaks.length === 0 ? 'clear' : 'leaking'} leaks=${leaks.length === 0 ? 'none' : leaks.join(',')}`
      );
    }
  }
} else if (report === 'parity') {
  console.log('Façade parity report:');
  console.log(`Status: ${facadeParityState.violations.length === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`Documented APIs: ${facadeParityState.documentedApis.length}`);
  console.log(`Façade value exports: ${facadeParityState.facadeValueExports.length}`);
  console.log(`Missing documented APIs: ${facadeParityState.missingDocumentedApis.length}`);
  console.log(`Undocumented exports: ${facadeParityState.undocumentedFacadeExports.length}`);
  console.log(
    `Undocumented exports without policy: ${facadeParityState.undocumentedWithoutPolicy.length}`
  );
  console.log(
    `Allowlisted undocumented exports: ${facadeParityState.allowlistedUndocumentedExports.length}`
  );
  console.log(`Stale allowlist entries: ${facadeParityState.staleAllowlistEntries.length}`);
  console.log(
    `Undocumented surface list entries: ${facadeParityState.parityListedUndocumentedExports.length}`
  );
  console.log(`Stale surface list entries: ${facadeParityState.staleParitySurfaceEntries.length}`);
  console.log(`Surface list omissions: ${facadeParityState.paritySurfaceOmissions.length}`);
  if (facadeParityState.undocumentedFacadeExports.length > 0) {
    console.log(`undocumented=${facadeParityState.undocumentedFacadeExports.join(',')}`);
  }
} else if (report === 'companion') {
  console.log('Companion coverage report (§13.3):');
  console.log(`Status: ${companionCoverageState.violations.length === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`Surfaces: ${companionCoverageState.entries.length}`);
  console.log(`Violations: ${companionCoverageState.violations.length}`);
  for (const entry of companionCoverageState.entries) {
    console.log(
      `surface=${entry.surface} status=${entry.status} targeted=${entry.coveredByTargetedScope} file=${entry.surfaceExists} test=${entry.testAnchorExists}`
    );
  }
} else if (report === 'semantic') {
  console.log('Auftakt semantic guard report:');
  console.log(`Status: ${semanticGuardState.violations.length === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`Policies: ${semanticGuardState.entries.length}`);
  console.log(`Violations: ${semanticGuardState.violations.length}`);
  for (const entry of semanticGuardState.entries) {
    const productionHits = entry.hits.filter((hit) => !TEST_FILE.test(hit.file)).length;
    console.log(
      `policy=${entry.name} hits=${entry.hits.length} production=${productionHits} allowed=${entry.allowedFiles.length}`
    );
    for (const hit of entry.hits) {
      console.log(`file=${hit.file} count=${hit.count} allowed=${hit.allowed}`);
    }
  }
} else if (report === 'completion') {
  console.log('Auftakt completion gate:');
  console.log('1. Surface proof: pnpm run check:auftakt-migration -- --proof');
  console.log('2. Semantic gate: pnpm run check:auftakt-semantic');
  console.log('3. Canonical sequence: pnpm run check:auftakt-complete');
} else {
  console.log(`Gateway importers (${importers.length}):`);
  for (const file of importers) {
    console.log(`- ${file}`);
  }
}
