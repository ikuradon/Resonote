import { readFileSync } from 'node:fs';

import {
  collectGatewayCompatibilityImportViolations,
  collectGatewayExportSnapshotViolations,
  collectSharedNostrOwnershipState,
  collectSpecifiers,
  findGatewayImporters,
  ROOT,
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
const exportViolations = collectGatewayExportSnapshotViolations();
const ownershipState = collectSharedNostrOwnershipState();
const consumerState = collectTargetedConsumerState();

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
  ...exportViolations,
  ...ownershipViolations,
  ...consumerState.violations
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

  if (exportViolations.length > 0) {
    console.error('Gateway export snapshot violations:');
    for (const violation of exportViolations) {
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

  process.exit(1);
}

const importers = findGatewayImporters(sourceFiles);
const unauthorizedImporterFiles = parseViolationFiles(unauthorizedImportViolations);
const allowlistedImporters = importers.filter((file) => !unauthorizedImporterFiles.includes(file));
const proofComplete =
  unauthorizedImportViolations.length === 0 &&
  exportViolations.length === 0 &&
  ownershipViolations.length === 0 &&
  consumerState.violations.length === 0;

if (proof) {
  console.log('--- AUFTAKT MIGRATION PROOF ---');
  console.log(`Status: ${proofComplete ? 'COMPLETE' : 'IN_PROGRESS'}`);
  console.log(`Date: ${new Date().toISOString()}`);
  console.log('');
  console.log('1. Gateway Compatibility Surface');
  console.log(`   Allowlisted internal importers: ${allowlistedImporters.length}`);
  for (const file of allowlistedImporters) {
    console.log(`   - ${file}`);
  }
  console.log(`   Unauthorized importers: ${unauthorizedImporterFiles.length}`);
  for (const file of unauthorizedImporterFiles) {
    console.log(`   - ${file}`);
  }
  console.log('');
  console.log('2. Gateway Exports');
  console.log(`   Status: ${exportViolations.length === 0 ? 'STABLE' : 'VIOLATED'}`);
  console.log('');
  console.log('3. Ownership Distribution');
  const counts = ownershipState.records.reduce((acc, r) => {
    acc[r.classification] = (acc[r.classification] || 0) + 1;
    return acc;
  }, {});
  for (const [cls, count] of Object.entries(counts)) {
    console.log(`   - ${cls}: ${count}`);
  }
  console.log('');
  console.log('4. Targeted Consumer Cutover');
  console.log(`   Status: ${consumerState.violations.length === 0 ? 'CLEAR' : 'LEAKING'}`);
  console.log(`   Targeted files: ${consumerState.fileCount}`);
  console.log(`   Consumer leak count: ${consumerState.violations.length}`);
  for (const scope of consumerState.scopes) {
    console.log(
      `   scope=${scope.name} status=${scope.status} files=${scope.fileCount} leaks=${scope.leakCount}`
    );
  }
  console.log('');
  console.log('5. Retirement Readiness');
  const readyToRetire = ownershipState.records.filter(
    (r) =>
      r.disposition.includes('retire') &&
      r.file !== 'src/shared/nostr/gateway.ts' &&
      !importers.includes(r.file)
  );
  if (unauthorizedImporterFiles.length === 0) {
    readyToRetire.push(
      ...ownershipState.records.filter((r) => r.file === 'src/shared/nostr/gateway.ts')
    );
  }
  console.log(`   Files ready to retire: ${readyToRetire.length}`);
  for (const r of readyToRetire) {
    console.log(`   - ${r.file}`);
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
