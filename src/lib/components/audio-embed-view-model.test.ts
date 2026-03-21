import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  setContentMock,
  updatePlaybackMock,
  fromBase64urlMock,
  onSeekMock,
  seekCleanupMock,
  seekState
} = vi.hoisted(() => ({
  setContentMock: vi.fn(),
  updatePlaybackMock: vi.fn(),
  fromBase64urlMock: vi.fn((value: string) => `decoded:${value}`),
  onSeekMock: vi.fn(),
  seekCleanupMock: vi.fn(),
  seekState: { callback: null as ((positionMs: number) => void) | null }
}));

vi.mock('$shared/content/url-utils.js', () => ({
  fromBase64url: fromBase64urlMock
}));

vi.mock('$shared/browser/player.js', () => ({
  setContent: setContentMock,
  updatePlayback: updatePlaybackMock
}));

vi.mock('$shared/browser/seek-bridge.js', () => ({
  onSeek: onSeekMock.mockImplementation((callback: (positionMs: number) => void) => {
    seekState.callback = callback;
    return seekCleanupMock;
  })
}));

import { createAudioEmbedViewModel } from './audio-embed-view-model.svelte.js';

interface MutableAudioElement {
  paused: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  play: () => Promise<void>;
  pause: () => void;
  addEventListener: (type: string, listener: EventListener) => void;
  removeEventListener: (type: string, listener: EventListener) => void;
}

function createFakeAudioElement(initial?: Partial<HTMLAudioElement>) {
  const listeners = new Map<string, EventListener[]>();
  const audio: MutableAudioElement = {
    paused: true,
    currentTime: 0,
    duration: 0,
    volume: 1,
    play: vi.fn(async () => {
      audio.paused = false;
    }),
    pause: vi.fn(() => {
      audio.paused = true;
    }),
    addEventListener: vi.fn((type: string, listener: EventListener) => {
      const current = listeners.get(type) ?? [];
      current.push(listener);
      listeners.set(type, current);
    }),
    removeEventListener: vi.fn((type: string, listener: EventListener) => {
      const current = listeners.get(type) ?? [];
      listeners.set(
        type,
        current.filter((candidate) => candidate !== listener)
      );
    }),
    ...initial
  };

  return {
    audio,
    element: audio as unknown as HTMLAudioElement,
    emit(type: string) {
      for (const listener of listeners.get(type) ?? []) {
        listener(new Event(type));
      }
    }
  };
}

describe('createAudioEmbedViewModel', () => {
  beforeEach(() => {
    setContentMock.mockReset();
    updatePlaybackMock.mockReset();
    fromBase64urlMock.mockClear();
    onSeekMock.mockClear();
    seekCleanupMock.mockReset();
    seekState.callback = null;
  });

  it('should derive audio src from enclosure url or decoded content id', () => {
    const fromContentId = createAudioEmbedViewModel({
      getContentId: () => ({ platform: 'audio', type: 'track', id: 'abc' }),
      getEnclosureUrl: () => undefined
    });
    const fromEnclosure = createAudioEmbedViewModel({
      getContentId: () => ({ platform: 'audio', type: 'track', id: 'ignored' }),
      getEnclosureUrl: () => 'https://cdn.example.com/file.mp3'
    });

    expect(fromContentId.audioSrc).toBe('decoded:abc');
    expect(fromEnclosure.audioSrc).toBe('https://cdn.example.com/file.mp3');
  });

  it('should sync playback state from audio element events', () => {
    const contentId = { platform: 'audio', type: 'track', id: 'abc' };
    const vm = createAudioEmbedViewModel({
      getContentId: () => contentId,
      getEnclosureUrl: () => undefined
    });
    const { audio, element, emit } = createFakeAudioElement({
      duration: 120,
      currentTime: 12,
      paused: true,
      volume: 0.25
    });

    const action = vm.bindAudioElement(element);

    emit('loadedmetadata');
    expect(vm.duration).toBe(120);
    expect(vm.error).toBe(false);
    expect(setContentMock).toHaveBeenCalledWith(contentId);

    audio.paused = false;
    emit('play');
    expect(vm.isPaused).toBe(false);
    expect(updatePlaybackMock).toHaveBeenLastCalledWith(12000, 120000, false);

    audio.currentTime = 18;
    emit('timeupdate');
    expect(vm.currentTime).toBe(18);
    expect(updatePlaybackMock).toHaveBeenLastCalledWith(18000, 120000, false);

    audio.paused = true;
    emit('pause');
    expect(vm.isPaused).toBe(true);
    expect(updatePlaybackMock).toHaveBeenLastCalledWith(18000, 120000, true);

    seekState.callback?.(3000);
    expect(audio.currentTime).toBe(3);

    action?.destroy?.();
    expect(seekCleanupMock).toHaveBeenCalledTimes(1);
  });

  it('should proxy play, pause, seek and volume inputs to the audio element', async () => {
    const vm = createAudioEmbedViewModel({
      getContentId: () => ({ platform: 'audio', type: 'track', id: 'abc' }),
      getEnclosureUrl: () => undefined
    });
    const { audio, element } = createFakeAudioElement();

    vm.bindAudioElement(element);

    await vm.togglePlayPause();
    expect(audio.play).toHaveBeenCalledTimes(1);

    audio.paused = false;
    await vm.togglePlayPause();
    expect(audio.pause).toHaveBeenCalledTimes(1);

    vm.handleSeekInput({ target: { value: '42.5' } } as unknown as Event);
    expect(audio.currentTime).toBe(42.5);

    vm.handleVolumeInput({ target: { value: '0.6' } } as unknown as Event);
    expect(audio.volume).toBe(0.6);
    expect(vm.volume).toBe(0.6);
  });
});
