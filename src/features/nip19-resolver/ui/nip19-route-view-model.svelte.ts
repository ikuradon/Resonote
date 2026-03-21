import {
  resolveNip19Navigation,
  type Nip19NavigationErrorKey
} from '../application/resolve-nip19-navigation.js';

interface Nip19RouteViewModelOptions {
  getValue: () => string;
  navigate: (path: string) => void;
}

export function createNip19RouteViewModel(options: Nip19RouteViewModelOptions) {
  let loading = $state(true);
  let error = $state<Nip19NavigationErrorKey | null>(null);
  let contentPath = $state<string | null>(null);

  $effect(() => {
    const value = options.getValue();
    let cancelled = false;

    loading = true;
    error = null;
    contentPath = null;

    if (!value) {
      loading = false;
      error = 'nip19.invalid';
      return;
    }

    resolveNip19Navigation(value).then((result) => {
      if (cancelled) return;

      if (result.kind === 'redirect') {
        options.navigate(result.path);
        return;
      }

      loading = false;
      error = result.errorKey;
      contentPath = result.contentPath ?? null;
    });

    return () => {
      cancelled = true;
    };
  });

  return {
    get loading() {
      return loading;
    },
    get error() {
      return error;
    },
    get contentPath() {
      return contentPath;
    }
  };
}
