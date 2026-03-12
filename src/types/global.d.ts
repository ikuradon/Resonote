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
