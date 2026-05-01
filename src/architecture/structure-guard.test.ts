import { describe, expect, it } from 'vitest';

import {
  bannedImportPatterns,
  collectBannedImportViolations,
  collectGatewayInteropImportViolations,
  collectRetiredAuftaktInternalImportViolations,
  ROOT,
  walk
} from '../../scripts/auftakt-migration-guard.mjs';

describe('structure guard', () => {
  const sourceFiles = walk(ROOT);

  it('should not reintroduce legacy store or i18n runtime imports', () => {
    expect(bannedImportPatterns.length).toBeGreaterThan(0);
    const violations = collectBannedImportViolations(sourceFiles);
    expect(violations).toEqual([]);
  });

  it('should keep the gateway interop surface out of app/runtime modules', () => {
    const violations = collectGatewayInteropImportViolations(sourceFiles);
    expect(violations).toEqual([]);
  });

  it('should not import retired low-level Auftakt helper modules', () => {
    const violations = collectRetiredAuftaktInternalImportViolations(sourceFiles);
    expect(violations).toEqual([]);
  });
});
