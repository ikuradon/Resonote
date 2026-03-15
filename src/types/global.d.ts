interface Window {
  nostr?: {
    getPublicKey(): Promise<string>;
    signEvent(event: {
      kind: number;
      created_at: number;
      tags: string[][];
      content: string;
    }): Promise<{
      id: string;
      pubkey: string;
      created_at: number;
      kind: number;
      tags: string[][];
      content: string;
      sig: string;
    }>;
    nip04?: {
      encrypt(pubkey: string, plaintext: string): Promise<string>;
      decrypt(pubkey: string, ciphertext: string): Promise<string>;
    };
    nip44?: {
      encrypt(pubkey: string, plaintext: string): Promise<string>;
      decrypt(pubkey: string, ciphertext: string): Promise<string>;
    };
  };

  onSpotifyIframeApiReady?: (api: SpotifyIFrameAPI) => void;
  onYouTubeIframeAPIReady?: () => void;
}

interface SpotifyIFrameAPI {
  createController(
    element: HTMLElement,
    options: SpotifyEmbedOptions,
    callback: (controller: SpotifyEmbedController) => void
  ): void;
}

interface SpotifyEmbedOptions {
  uri: string;
  width?: string | number;
  height?: string | number;
}

interface SpotifyPlaybackState {
  isPaused: boolean;
  isBuffering: boolean;
  duration: number;
  position: number;
}

interface SpotifyEmbedController {
  addListener(
    event: 'playback_update',
    callback: (e: { data: SpotifyPlaybackState }) => void
  ): void;
  addListener(event: 'ready', callback: () => void): void;
  play(): void;
  pause(): void;
  resume(): void;
  seek(seconds: number): void;
  togglePlay(): void;
  loadUri(uri: string): void;
  destroy(): void;
}

declare namespace Vimeo {
  class Player {
    constructor(
      element: HTMLIFrameElement | HTMLElement | string,
      options?: Record<string, unknown>
    );
    play(): Promise<void>;
    pause(): Promise<void>;
    getCurrentTime(): Promise<number>;
    setCurrentTime(seconds: number): Promise<number>;
    getDuration(): Promise<number>;
    getPaused(): Promise<boolean>;
    getVolume(): Promise<number>;
    setVolume(volume: number): Promise<number>;
    destroy(): Promise<void>;
    on(event: string, callback: (data: any) => void): void; // eslint-disable-line @typescript-eslint/no-explicit-any
    off(event: string, callback?: (data: any) => void): void; // eslint-disable-line @typescript-eslint/no-explicit-any
  }
}

declare namespace SC {
  function Widget(iframe: HTMLIFrameElement): SC.WidgetInstance;
  namespace Widget {
    const Events: {
      READY: string;
      PLAY: string;
      PAUSE: string;
      FINISH: string;
      PLAY_PROGRESS: string;
      SEEK: string;
      ERROR: string;
    };
  }
  interface WidgetInstance {
    bind(eventName: string, listener: (data?: unknown) => void): void;
    unbind(eventName: string): void;
    play(): void;
    pause(): void;
    toggle(): void;
    seekTo(milliseconds: number): void;
    setVolume(volume: number): void;
    getVolume(callback: (volume: number) => void): void;
    getDuration(callback: (duration: number) => void): void;
    getPosition(callback: (position: number) => void): void;
    isPaused(callback: (paused: boolean) => void): void;
    getCurrentSound(callback: (sound: unknown) => void): void;
    load(url: string, options?: Record<string, unknown>): void;
  }
}

declare namespace Mixcloud {
  function PlayerWidget(element: HTMLIFrameElement): MixcloudWidget;

  interface MixcloudWidget {
    ready: Promise<void>;
    play(): void;
    pause(): void;
    togglePlay(): void;
    seek(seconds: number): Promise<boolean>;
    load(cloudcastKey: string, startPlaying?: boolean): void;
    getPosition(): Promise<number>;
    getDuration(): Promise<number>;
    getIsPaused(): Promise<boolean>;
    events: {
      play: { on(callback: () => void): void; off(callback: () => void): void };
      pause: { on(callback: () => void): void; off(callback: () => void): void };
      ended: { on(callback: () => void): void; off(callback: () => void): void };
      buffering: { on(callback: () => void): void; off(callback: () => void): void };
      progress: {
        on(callback: (position: number, duration: number) => void): void;
        off(callback: (position: number, duration: number) => void): void;
      };
      error: {
        on(callback: (error: unknown) => void): void;
        off(callback: (error: unknown) => void): void;
      };
    };
  }
}

declare namespace SP {
  function getWidget(iframe: HTMLIFrameElement | string): SpreakerWidget;

  interface SpreakerWidget {
    play(): boolean;
    pause(): boolean;
    seek(milliseconds: number): boolean;
    load(episodeId: string): boolean;
    playPrev(): boolean;
    playNext(): boolean;
    getPosition(callback: (position: number, progress: number, duration: number) => void): boolean;
    getDuration(callback: (duration: number) => void): boolean;
    getState(callback: (episode: unknown, state: string, isPlaying: boolean) => void): boolean;
  }
}

declare class PB {
  constructor(iframe: HTMLIFrameElement | string);
  play(): void;
  pause(): void;
  toggle(): void;
  seekTo(milliseconds: number): void;
  setVolume(volume: number): void;
  getVolume(callback: (volume: number) => void): void;
  getDuration(callback: (duration: number) => void): void;
  getPosition(callback: (position: number) => void): void;
  isPaused(callback: (paused: boolean) => void): void;
  bind(event: string, callback: (data?: unknown) => void): void;
  unbind(event: string): void;
}

declare namespace PB {
  namespace Widget {
    const Events: {
      READY: string;
      PLAY: string;
      PAUSE: string;
      PLAY_PROGRESS: string;
      FINISH: string;
      LOAD_PROGRESS: string;
      SEEK: string;
    };
  }
}

declare namespace YT {
  const PlayerState: {
    UNSTARTED: -1;
    ENDED: 0;
    PLAYING: 1;
    PAUSED: 2;
    BUFFERING: 3;
    CUED: 5;
  };

  interface PlayerOptions {
    width?: string | number;
    height?: string | number;
    videoId?: string;
    playerVars?: {
      enablejsapi?: 1;
      origin?: string;
      autoplay?: 0 | 1;
      rel?: 0 | 1;
    };
    events?: {
      onReady?: (event: PlayerEvent) => void;
      onStateChange?: (event: OnStateChangeEvent) => void;
      onError?: (event: OnErrorEvent) => void;
    };
  }

  interface PlayerEvent {
    target: Player;
  }

  interface OnStateChangeEvent {
    target: Player;
    data: number;
  }

  interface OnErrorEvent {
    target: Player;
    data: number;
  }

  class Player {
    constructor(element: HTMLElement | string, options: PlayerOptions);
    playVideo(): void;
    pauseVideo(): void;
    stopVideo(): void;
    seekTo(seconds: number, allowSeekAhead: boolean): void;
    loadVideoById(videoId: string): void;
    getCurrentTime(): number;
    getDuration(): number;
    getPlayerState(): number;
    destroy(): void;
  }
}
