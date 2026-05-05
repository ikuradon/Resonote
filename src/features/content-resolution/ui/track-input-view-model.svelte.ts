import { startIntervalTask } from '$shared/browser/interval-task.js';
import type { TranslationKey } from '$shared/i18n/t.js';
import { t } from '$shared/i18n/t.js';

import { resolveContentNavigation } from '../application/content-navigation.js';

const TRACK_PLACEHOLDER_KEYS = [
  'track.placeholder.youtube',
  'track.placeholder.spotify',
  'track.placeholder.soundcloud',
  'track.placeholder.podcast',
  'track.placeholder.vimeo',
  'track.placeholder.mixcloud',
  'track.placeholder.audio',
  'track.placeholder.niconico',
  'track.placeholder.podbean'
] satisfies TranslationKey[];

interface TrackInputViewModelOptions {
  navigate: (path: string) => void;
}

export function createTrackInputViewModel(options: TrackInputViewModelOptions) {
  let url = $state('');
  let error = $state('');
  let placeholderIndex = $state(0);
  let placeholderVisible = $state(true);
  let navigationRequestId = 0;

  let placeholders = $derived.by(() =>
    TRACK_PLACEHOLDER_KEYS.map((translationKey) => t(translationKey))
  );

  $effect(() => {
    let fadeTimer: ReturnType<typeof setTimeout> | undefined;
    const placeholderTask = startIntervalTask(() => {
      placeholderVisible = false;
      fadeTimer = setTimeout(() => {
        placeholderIndex = (placeholderIndex + 1) % placeholders.length;
        placeholderVisible = true;
      }, 300);
    }, 3000);

    return () => {
      placeholderTask.stop();
      clearTimeout(fadeTimer);
    };
  });

  async function submit(): Promise<void> {
    error = '';
    const requestId = ++navigationRequestId;
    const result = await resolveContentNavigation(url);
    if (requestId !== navigationRequestId) return;
    if (!result) return;

    if ('errorKey' in result) {
      error = t(result.errorKey);
      return;
    }

    options.navigate(result.path);
  }

  return {
    get url() {
      return url;
    },
    set url(value: string) {
      if (value !== url) {
        navigationRequestId++;
      }
      url = value;
      if (error) {
        error = '';
      }
    },
    get error() {
      return error;
    },
    get placeholder() {
      return placeholders[placeholderIndex] ?? '';
    },
    get placeholderVisible() {
      return placeholderVisible;
    },
    get canSubmit() {
      return url.trim().length > 0;
    },
    submit
  };
}
