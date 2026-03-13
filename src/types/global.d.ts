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
