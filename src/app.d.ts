// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
  namespace App {
    // interface Error {}
    // interface Locals {}
    // interface PageData {}
    // interface PageState {}
    interface Platform {
      env: {
        SYSTEM_NOSTR_PRIVKEY: string;
        YOUTUBE_API_KEY?: string;
        UNSAFE_ALLOW_PRIVATE_IPS?: string;
      };
      context: ExecutionContext;
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface ImportMetaEnv {
  readonly VITE_PR_NUMBER?: string;
}

export {};
