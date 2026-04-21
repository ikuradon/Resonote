import { readFileSync } from 'node:fs';

import {
  collectGatewayCompatibilityImportViolations,
  collectSharedNostrOwnershipState,
  collectSpecifiers,
  findGatewayImporters,
  ROOT,
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
const failOnUnauthorized = process.argv.includes('--fail-on-unauthorized');
const failOnUnclassified = process.argv.includes('--fail-on-unclassified');

const forbiddenConsumerSpecifiers = [
  '$shared/nostr/gateway.js',
  '$shared/nostr/cached-query.js',
  '$shared/nostr/user-relays.js'
];

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
    file: 'src/shared/nostr/cached-query.ts',
    specifiers: ['$shared/nostr/cached-query.js'],
    allowedTestImporters: []
  },
  {
    file: 'src/shared/nostr/user-relays.ts',
    specifiers: ['$shared/nostr/user-relays.js'],
    allowedTestImporters: ['src/shared/nostr/user-relays.test.ts']
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
      .filter(({ specifiers }) => policy.specifiers.some((specifier) => specifiers.includes(specifier)))
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
          `${file}: ${specifier} — targeted Task 8 consumers must use $shared/auftakt/resonote.js or approved high-level package APIs.`
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

function parseViolationFiles(violations) {
  return violations.map((violation) => violation.split(':', 1)[0]).sort();
}

const sourceFiles = walk(ROOT);
const unauthorizedImportViolations = collectGatewayCompatibilityImportViolations(sourceFiles);
const ownershipState = collectSharedNostrOwnershipState();
const consumerState = collectTargetedConsumerState();
const residualLegacyAliasState = collectResidualLegacyAliasState();

const ownershipViolations = [...ownershipState.invalidEntries];
if (failOnUnclassified) {
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
  ...(failOnUnauthorized ? unauthorizedImportViolations : []),
  ...ownershipViolations,
  ...consumerState.violations,
  ...residualLegacyAliasState.violations
];

if (violations.length > 0) {
  console.error('Auftakt migration guard failed.\n');

  if (failOnUnauthorized && unauthorizedImportViolations.length > 0) {
    console.error('Unauthorized gateway importers:');
    for (const violation of unauthorizedImportViolations) {
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

  process.exit(1);
}

const importers = findGatewayImporters(sourceFiles);
const unauthorizedImporterFiles = parseViolationFiles(unauthorizedImportViolations);
const proofComplete =
  unauthorizedImportViolations.length === 0 &&
  ownershipViolations.length === 0 &&
  consumerState.violations.length === 0 &&
  residualLegacyAliasState.violations.length === 0;

if (proof) {
  console.log('--- AUFTAKT MIGRATION PROOF ---');
  console.log(`Status: ${proofComplete ? 'COMPLETE' : 'IN_PROGRESS'}`);
  console.log(`Date: ${new Date().toISOString()}`);
  console.log('');
  console.log('1. Gateway Compatibility Surface');
  console.log(`   Gateway importers: ${importers.length}`);
  for (const file of importers) {
    console.log(`   - ${file}`);
  }
  console.log(`   Unauthorized importers: ${unauthorizedImporterFiles.length}`);
  for (const file of unauthorizedImporterFiles) {
    console.log(`   - ${file}`);
  }
  console.log('');
  console.log('2. Ownership Distribution');
  const counts = ownershipState.records.reduce((acc, r) => {
    acc[r.classification] = (acc[r.classification] || 0) + 1;
    return acc;
  }, {});
  for (const [cls, count] of Object.entries(counts)) {
    console.log(`   - ${cls}: ${count}`);
  }
  console.log('');
  console.log('3. Targeted Consumer Cutover');
  console.log(`   Status: ${consumerState.violations.length === 0 ? 'CLEAR' : 'LEAKING'}`);
  console.log(`   Targeted files: ${consumerState.fileCount}`);
  console.log(`   Consumer leak count: ${consumerState.violations.length}`);
  for (const scope of consumerState.scopes) {
    console.log(
      `   scope=${scope.name} status=${scope.status} files=${scope.fileCount} leaks=${scope.leakCount}`
    );
  }
  console.log('');
  console.log('4. Retirement Readiness');
  const readyToRetire = ownershipState.records.filter(
    (r) => r.disposition.startsWith('retire-ready') && !importers.includes(r.file)
  );
  console.log(`   Files ready to retire: ${readyToRetire.length}`);
  for (const r of readyToRetire) {
    console.log(`   - ${r.file}`);
  }
  console.log('');
  console.log('5. Intentional Residual Legacy Coverage');
  const residualLegacyCoverage = ownershipState.records.filter((r) =>
    r.disposition.includes('intentional residual legacy alias')
  );
  console.log(`   Residual legacy entries: ${residualLegacyCoverage.length}`);
  for (const r of residualLegacyCoverage) {
    console.log(`   - ${r.file}`);
  }
  console.log('');
  console.log('6. Residual Compatibility Alias Enforcement');
  for (const alias of residualLegacyAliasState.aliases) {
    console.log(
      `   file=${alias.file} status=${alias.status} importers=${alias.importers.length} production=${alias.productionImporters.length} allowed-test=${alias.allowedTestImporters.length} unauthorized-test=${alias.unauthorizedTestImporters.length}`
    );
    if (alias.allowedTestImporters.length > 0) {
      console.log(`   allowlist=${alias.allowedTestImporters.join(', ')}`);
    }
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
  console.log('Targeted consumer cutover report:');
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
} else {
  console.log(`Gateway importers (${importers.length}):`);
  for (const file of importers) {
    console.log(`- ${file}`);
  }
}
