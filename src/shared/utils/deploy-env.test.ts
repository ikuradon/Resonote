import { describe, expect, it } from 'vitest';
import { getEnvBannerConfig } from '$shared/utils/deploy-env.js';

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
