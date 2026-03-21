import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  loadExternalScript,
  loadWindowCallbackScript,
  reloadExternalScript
} from '$shared/browser/script-loader.js';

interface FakeScript {
  src: string;
  async: boolean;
  onload: null | (() => void);
  onerror: null | (() => void);
  parentNode: object | null;
  remove: () => void;
}

const originalDocument = globalThis.document;
const originalWindow = globalThis.window;

function getWindowRecord() {
  return globalThis.window as unknown as Record<string, unknown>;
}

function setupFakeDom() {
  const scripts: FakeScript[] = [];
  const head = {
    appendChild: vi.fn((script: FakeScript) => {
      script.parentNode = head;
      scripts.push(script);
      return script;
    })
  };

  const documentStub = {
    head,
    createElement: vi.fn((tag: string) => {
      if (tag !== 'script') {
        throw new Error(`Unexpected tag: ${tag}`);
      }
      const script: FakeScript = {
        src: '',
        async: false,
        onload: null,
        onerror: null,
        parentNode: null,
        remove: () => {
          script.parentNode = null;
          const index = scripts.indexOf(script);
          if (index >= 0) {
            scripts.splice(index, 1);
          }
        }
      };
      return script;
    }),
    getElementsByTagName: vi.fn((tag: string) => {
      if (tag !== 'script') {
        return [];
      }
      return scripts;
    })
  };

  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    writable: true,
    value: documentStub
  });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: {}
  });

  return { head, scripts };
}

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    writable: true,
    value: originalDocument
  });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: originalWindow
  });
});

describe('loadExternalScript', () => {
  it('should append a script only once for the same src', async () => {
    const { head, scripts } = setupFakeDom();

    const first = loadExternalScript({ src: 'https://example.com/a.js' });
    const second = loadExternalScript({ src: 'https://example.com/a.js' });

    expect(first).toBe(second);
    expect(head.appendChild).toHaveBeenCalledTimes(1);

    scripts[0].onload?.();
    await expect(first).resolves.toBeUndefined();
  });

  it('should reset the cache after a load error', async () => {
    const { head, scripts } = setupFakeDom();

    const first = loadExternalScript({ src: 'https://example.com/fail.js' });
    scripts[0].onerror?.();
    await expect(first).rejects.toThrow('Failed to load script');

    const second = loadExternalScript({ src: 'https://example.com/fail.js' });
    expect(head.appendChild).toHaveBeenCalledTimes(2);
    scripts[0].onload?.();
    await expect(second).resolves.toBeUndefined();
  });
});

describe('loadWindowCallbackScript', () => {
  it('should resolve when the global callback fires', async () => {
    const { head } = setupFakeDom();

    const promise = loadWindowCallbackScript({
      src: 'https://example.com/callback.js',
      callbackName: 'onExampleReady',
      getResolvedValue: (value) => value as string
    });

    expect(head.appendChild).toHaveBeenCalledTimes(1);
    (getWindowRecord().onExampleReady as (...args: unknown[]) => void)('ready');

    await expect(promise).resolves.toBe('ready');
    expect(getWindowRecord().onExampleReady).toBeUndefined();
  });

  it('should invoke onResolved for callback-loaded values', async () => {
    setupFakeDom();
    const onResolved = vi.fn();

    const promise = loadWindowCallbackScript({
      src: 'https://example.com/callback-api.js',
      callbackName: 'onApiReady',
      getResolvedValue: (value) => value as { name: string },
      onResolved
    });

    (getWindowRecord().onApiReady as (...args: unknown[]) => void)({ name: 'api' });

    await expect(promise).resolves.toEqual({ name: 'api' });
    expect(onResolved).toHaveBeenCalledWith({ name: 'api' });
  });
});

describe('reloadExternalScript', () => {
  it('should remove an existing script and append a fresh one', () => {
    const { head, scripts } = setupFakeDom();

    const first = reloadExternalScript('https://example.com/reload.js');
    expect(scripts).toHaveLength(1);

    const second = reloadExternalScript('https://example.com/reload.js');
    expect(head.appendChild).toHaveBeenCalledTimes(2);
    expect(scripts).toHaveLength(1);
    expect(second).not.toBe(first);
  });
});
