import { describe, expect, it } from 'vitest';
import { getEnvBannerConfig, detectEnvFromHostname } from '$shared/utils/deploy-env.js';

describe('getEnvBannerConfig', () => {
  it('returns green banner for dev', () => {
    const config = getEnvBannerConfig('dev');
    expect(config).toEqual({ label: 'Dev', colorClass: 'bg-green-600' });
  });

  it('returns yellow banner for staging', () => {
    const config = getEnvBannerConfig('staging');
    expect(config).toEqual({ label: 'Staging', colorClass: 'bg-yellow-600' });
  });

  it('returns blue banner with PR number for preview', () => {
    const config = getEnvBannerConfig('preview', '42');
    expect(config).toEqual({ label: 'PR #42', colorClass: 'bg-blue-600' });
  });

  it('returns blue banner without PR number for preview', () => {
    const config = getEnvBannerConfig('preview');
    expect(config).toEqual({ label: 'Preview', colorClass: 'bg-blue-600' });
  });

  it('returns null for production', () => {
    expect(getEnvBannerConfig('production')).toBeNull();
  });
});

describe('detectEnvFromHostname', () => {
  it('maps *.resonote-preview.pages.dev to preview', () => {
    expect(detectEnvFromHostname('cedar-tide.resonote-preview.pages.dev')).toBe('preview');
  });

  it('maps staging.resonote.pages.dev to staging', () => {
    expect(detectEnvFromHostname('staging.resonote.pages.dev')).toBe('staging');
  });

  it('maps resonote.pages.dev to production', () => {
    expect(detectEnvFromHostname('resonote.pages.dev')).toBe('production');
  });

  it('maps custom domain to production', () => {
    expect(detectEnvFromHostname('resonote.app')).toBe('production');
  });

  it('maps localhost to production (DEV check is in getDeployEnv)', () => {
    expect(detectEnvFromHostname('localhost')).toBe('production');
  });
});
