import { t } from '$shared/i18n/t.js';

import { resolveEncodedNavigation } from '../application/resolve-encoded-navigation.js';

interface ResolveLoaderViewModelOptions {
  getEncodedUrl: () => string;
  navigate: (path: string) => void;
}

export function createResolveLoaderViewModel(options: ResolveLoaderViewModelOptions) {
  let status = $state<'loading' | 'error'>('loading');
  let errorMessage = $state('');

  $effect(() => {
    const encodedUrl = options.getEncodedUrl();
    let cancelled = false;

    status = 'loading';
    errorMessage = '';

    if (!encodedUrl) {
      status = 'error';
      errorMessage = t('resolve.error.parse_failed');
      return;
    }

    void resolveEncodedNavigation(encodedUrl).then((result) => {
      if (cancelled) return;

      if ('path' in result) {
        options.navigate(result.path);
        return;
      }

      status = 'error';
      errorMessage = t(result.errorKey);
    });

    return () => {
      cancelled = true;
    };
  });

  return {
    get status() {
      return status;
    },
    get errorMessage() {
      return errorMessage;
    }
  };
}
