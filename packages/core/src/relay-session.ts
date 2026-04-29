export interface EventSigner {
  getPublicKey(): Promise<string> | string;
  signEvent(
    event: UnsignedEvent
  ):
    | Promise<SignedEventShape | { id: string; sig: string }>
    | SignedEventShape
    | { id: string; sig: string };
}

export interface UnsignedEvent {
  kind: number;
  content: string;
  tags: string[][];
  created_at: number;
}

export interface SignedEventShape extends UnsignedEvent {
  id: string;
  pubkey: string;
  sig: string;
}
