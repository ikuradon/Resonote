export interface SiteAdapter {
  readonly matchPatterns: string[];
  readonly platform: string;
  findMediaElement(): HTMLVideoElement | HTMLAudioElement | null;
  seek?(element: HTMLVideoElement | HTMLAudioElement, positionMs: number): void;
  onAttach?(element: HTMLVideoElement | HTMLAudioElement): void;
  onDetach?(element: HTMLVideoElement | HTMLAudioElement): void;
}
