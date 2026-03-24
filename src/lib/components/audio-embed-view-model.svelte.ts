import type { Action } from 'svelte/action';

import { setContent, updatePlayback } from '$shared/browser/player.js';
import { onSeek } from '$shared/browser/seek-bridge.js';
import type { ContentId } from '$shared/content/types.js';
import { fromBase64url } from '$shared/content/url-utils.js';

interface AudioEmbedViewModelOptions {
  getContentId: () => ContentId;
  getEnclosureUrl: () => string | undefined;
}

export function createAudioEmbedViewModel(options: AudioEmbedViewModelOptions) {
  let audioEl: HTMLAudioElement | undefined;
  let currentTime = $state(0);
  let duration = $state(0);
  let isPaused = $state(true);
  let volume = $state(1);
  let error = $state(false);

  let audioSrc = $derived.by(() => {
    const enclosureUrl = options.getEnclosureUrl();
    if (enclosureUrl) return enclosureUrl;

    const contentId = options.getContentId();
    return contentId.platform === 'audio' ? fromBase64url(contentId.id) : null;
  });

  function togglePlayPause(): void {
    if (!audioEl) return;
    if (audioEl.paused) {
      void audioEl.play();
    } else {
      audioEl.pause();
    }
  }

  function handleSeekInput(event: Event): void {
    if (!audioEl) return;
    const value = parseFloat((event.target as HTMLInputElement).value);
    audioEl.currentTime = value;
  }

  function handleVolumeInput(event: Event): void {
    if (!audioEl) return;
    const value = parseFloat((event.target as HTMLInputElement).value);
    audioEl.volume = value;
    volume = value;
  }

  const bindAudioElement: Action<HTMLAudioElement> = (audio) => {
    audioEl = audio;
    volume = audio.volume;

    const cleanupSeek = onSeek((positionMs) => {
      audio.currentTime = positionMs / 1000;
    });

    const onTimeUpdate = () => {
      currentTime = audio.currentTime;
      updatePlayback(audio.currentTime * 1000, audio.duration * 1000, audio.paused);
    };

    const onDurationChange = () => {
      duration = audio.duration;
    };

    const onPlay = () => {
      isPaused = false;
      updatePlayback(audio.currentTime * 1000, audio.duration * 1000, false);
    };

    const onPause = () => {
      isPaused = true;
      updatePlayback(audio.currentTime * 1000, audio.duration * 1000, true);
    };

    const onLoadedMetadata = () => {
      duration = audio.duration;
      error = false;
      setContent(options.getContentId());
    };

    const onError = () => {
      error = true;
    };

    const onVolumeChange = () => {
      volume = audio.volume;
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('error', onError);
    audio.addEventListener('volumechange', onVolumeChange);

    return {
      destroy() {
        cleanupSeek();
        audio.removeEventListener('timeupdate', onTimeUpdate);
        audio.removeEventListener('durationchange', onDurationChange);
        audio.removeEventListener('play', onPlay);
        audio.removeEventListener('pause', onPause);
        audio.removeEventListener('loadedmetadata', onLoadedMetadata);
        audio.removeEventListener('error', onError);
        audio.removeEventListener('volumechange', onVolumeChange);
        if (audioEl === audio) {
          audioEl = undefined;
        }
      }
    };
  };

  return {
    get audioSrc() {
      return audioSrc;
    },
    get currentTime() {
      return currentTime;
    },
    get duration() {
      return duration;
    },
    get isPaused() {
      return isPaused;
    },
    get volume() {
      return volume;
    },
    get error() {
      return error;
    },
    bindAudioElement,
    togglePlayPause,
    handleSeekInput,
    handleVolumeInput
  };
}
