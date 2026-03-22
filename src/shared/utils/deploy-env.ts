export type DeployEnv = 'dev' | 'staging' | 'preview' | 'production';

export interface EnvBannerConfig {
  label: string;
  colorClass: string;
}

/** Detect deploy environment from hostname (runtime) + import.meta.env.DEV (build-time). */
export function getDeployEnv(): DeployEnv {
  if (import.meta.env.DEV) return 'dev';
  if (typeof window === 'undefined') return 'production';
  const host = window.location.hostname;
  if (host.endsWith('.resonote-preview.pages.dev')) return 'preview';
  if (host === 'staging.resonote.pages.dev') return 'staging';
  if (host === 'resonote.pages.dev') return 'production';
  return 'production';
}

/** Get banner config for the given environment. Returns null for production. */
export function getEnvBannerConfig(env: DeployEnv, prNumber?: string): EnvBannerConfig | null {
  switch (env) {
    case 'dev':
      return { label: 'Dev', colorClass: 'bg-green-600' };
    case 'staging':
      return { label: 'Staging', colorClass: 'bg-yellow-600' };
    case 'preview':
      return {
        label: prNumber ? `PR #${prNumber}` : 'Preview',
        colorClass: 'bg-blue-600'
      };
    case 'production':
      return null;
  }
}
