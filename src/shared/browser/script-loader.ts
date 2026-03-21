// @public — Stable API for route/component/feature consumers
/**
 * Shared browser script loader helpers for third-party widget APIs.
 */

const pendingScripts = new Map<string, Promise<void>>();
const pendingCallbackScripts = new Map<string, Promise<unknown>>();

function getWindowRecord(): Record<string, unknown> {
  return window as unknown as Record<string, unknown>;
}

function getScriptElements(): HTMLScriptElement[] {
  return Array.from(document.getElementsByTagName('script'));
}

function findScript(src: string): HTMLScriptElement | undefined {
  return getScriptElements().find((script) => script.src === src);
}

function createScript(src: string): HTMLScriptElement {
  const script = document.createElement('script');
  script.src = src;
  script.async = true;
  return script;
}

export interface ExternalScriptOptions {
  src: string;
  isReady?: () => boolean;
}

export function loadExternalScript(options: ExternalScriptOptions): Promise<void> {
  if (options.isReady?.()) {
    return Promise.resolve();
  }

  const existing = pendingScripts.get(options.src);
  if (existing) {
    return existing;
  }

  const promise = new Promise<void>((resolve, reject) => {
    const script = findScript(options.src) ?? createScript(options.src);
    const appended = script.parentNode == null;

    const cleanup = () => {
      script.onload = null;
      script.onerror = null;
    };

    script.onload = () => {
      cleanup();
      resolve();
    };

    script.onerror = () => {
      cleanup();
      pendingScripts.delete(options.src);
      if (appended) {
        script.remove();
      }
      reject(new Error(`Failed to load script: ${options.src}`));
    };

    if (appended) {
      document.head.appendChild(script);
    }
  });

  pendingScripts.set(options.src, promise);
  return promise;
}

export interface WindowCallbackScriptOptions<T> {
  src: string;
  callbackName: string;
  isReady?: () => boolean;
  getResolvedValue: (...args: unknown[]) => T;
  onResolved?: (value: T) => void;
}

export function loadWindowCallbackScript<T>(options: WindowCallbackScriptOptions<T>): Promise<T> {
  if (options.isReady?.()) {
    return Promise.resolve(options.getResolvedValue());
  }

  const existing = pendingCallbackScripts.get(options.src);
  if (existing) {
    return existing as Promise<T>;
  }

  const promise = new Promise<T>((resolve, reject) => {
    const win = getWindowRecord();
    const previousCallback = win[options.callbackName];
    const script = findScript(options.src) ?? createScript(options.src);
    const appended = script.parentNode == null;

    const cleanup = () => {
      if (previousCallback === undefined) {
        delete win[options.callbackName];
      } else {
        win[options.callbackName] = previousCallback;
      }
      script.onerror = null;
    };

    win[options.callbackName] = (...args: unknown[]) => {
      if (typeof previousCallback === 'function') {
        (previousCallback as (...callbackArgs: unknown[]) => unknown)(...args);
      }
      const value = options.getResolvedValue(...args);
      options.onResolved?.(value);
      cleanup();
      resolve(value);
    };

    script.onerror = () => {
      cleanup();
      pendingCallbackScripts.delete(options.src);
      if (appended) {
        script.remove();
      }
      reject(new Error(`Failed to load script: ${options.src}`));
    };

    if (appended) {
      document.head.appendChild(script);
    }
  });

  pendingCallbackScripts.set(options.src, promise);
  return promise;
}

export function reloadExternalScript(src: string): HTMLScriptElement {
  pendingScripts.delete(src);
  pendingCallbackScripts.delete(src);
  findScript(src)?.remove();
  const script = createScript(src);
  document.head.appendChild(script);
  return script;
}
