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
  it('creates a script element and appends to document head', async () => {
    const { head, scripts } = setupFakeDom();

    const promise = loadExternalScript({ src: 'https://example.com/widget.js' });
    expect(head.appendChild).toHaveBeenCalledTimes(1);

    const script = scripts[0];
    expect(script.src).toBe('https://example.com/widget.js');
    expect(script.async).toBe(true);

    script.onload?.();
    await expect(promise).resolves.toBeUndefined();
  });

  it('resolves immediately when isReady returns true', async () => {
    setupFakeDom();

    const promise = loadExternalScript({
      src: 'https://example.com/ready.js',
      isReady: () => true
    });

    await expect(promise).resolves.toBeUndefined();
  });

  it('returns same promise for duplicate script loads', async () => {
    const { head, scripts } = setupFakeDom();

    const first = loadExternalScript({ src: 'https://example.com/a.js' });
    const second = loadExternalScript({ src: 'https://example.com/a.js' });

    expect(first).toBe(second);
    expect(head.appendChild).toHaveBeenCalledTimes(1);

    scripts[0].onload?.();
    await expect(first).resolves.toBeUndefined();
  });

  it('rejects on script load error with descriptive message', async () => {
    const { scripts } = setupFakeDom();

    const promise = loadExternalScript({ src: 'https://example.com/fail.js' });
    scripts[0].onerror?.();

    await expect(promise).rejects.toThrow('Failed to load script: https://example.com/fail.js');
  });

  it('removes script from DOM on error if it was appended', async () => {
    const { scripts } = setupFakeDom();

    const promise = loadExternalScript({ src: 'https://example.com/fail.js' });
    expect(scripts).toHaveLength(1);

    scripts[0].onerror?.();
    await expect(promise).rejects.toThrow();
    expect(scripts).toHaveLength(0);
  });

  it('resets the cache after a load error allowing retry', async () => {
    const { head, scripts } = setupFakeDom();

    const first = loadExternalScript({ src: 'https://example.com/fail.js' });
    scripts[0].onerror?.();
    await expect(first).rejects.toThrow('Failed to load script');

    const second = loadExternalScript({ src: 'https://example.com/fail.js' });
    expect(head.appendChild).toHaveBeenCalledTimes(2);
    scripts[0].onload?.();
    await expect(second).resolves.toBeUndefined();
  });

  it('cleans up onload/onerror handlers after successful load', async () => {
    const { scripts } = setupFakeDom();

    const promise = loadExternalScript({ src: 'https://example.com/cleanup.js' });
    const script = scripts[0];
    script.onload?.();

    await promise;
    expect(script.onload).toBeNull();
    expect(script.onerror).toBeNull();
  });

  it('reuses existing script element already in DOM', async () => {
    const { head, scripts } = setupFakeDom();

    // Pre-add a script to simulate one already in the DOM
    const existingScript: FakeScript = {
      src: 'https://example.com/existing.js',
      async: true,
      onload: null,
      onerror: null,
      parentNode: head,
      remove: vi.fn()
    };
    scripts.push(existingScript);

    const promise = loadExternalScript({ src: 'https://example.com/existing.js' });
    // Should not append again since script already has parentNode
    expect(head.appendChild).not.toHaveBeenCalled();

    existingScript.onload?.();
    await expect(promise).resolves.toBeUndefined();
  });
});

describe('loadWindowCallbackScript', () => {
  it('resolves immediately when isReady returns true', async () => {
    setupFakeDom();

    const promise = loadWindowCallbackScript({
      src: 'https://example.com/api.js',
      callbackName: 'onReady',
      isReady: () => true,
      getResolvedValue: () => 'already-loaded'
    });

    await expect(promise).resolves.toBe('already-loaded');
  });

  it('resolves when the global callback fires', async () => {
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

  it('invokes onResolved for callback-loaded values', async () => {
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

  it('rejects on script load error', async () => {
    const { scripts } = setupFakeDom();

    const promise = loadWindowCallbackScript({
      src: 'https://example.com/fail-cb.js',
      callbackName: 'onFail',
      getResolvedValue: () => null
    });

    scripts[0].onerror?.();
    await expect(promise).rejects.toThrow('Failed to load script: https://example.com/fail-cb.js');
  });

  it('removes script from DOM on error if appended', async () => {
    const { scripts } = setupFakeDom();

    const promise = loadWindowCallbackScript({
      src: 'https://example.com/fail-remove.js',
      callbackName: 'onFailRemove',
      getResolvedValue: () => null
    });

    expect(scripts).toHaveLength(1);
    scripts[0].onerror?.();
    await expect(promise).rejects.toThrow();
    expect(scripts).toHaveLength(0);
  });

  it('returns same promise for duplicate callback script loads', async () => {
    setupFakeDom();

    const first = loadWindowCallbackScript({
      src: 'https://example.com/dedup.js',
      callbackName: 'onDedup',
      getResolvedValue: () => 'value'
    });
    const second = loadWindowCallbackScript({
      src: 'https://example.com/dedup.js',
      callbackName: 'onDedup',
      getResolvedValue: () => 'value'
    });

    expect(first).toBe(second);

    (getWindowRecord().onDedup as (...args: unknown[]) => void)();
    await expect(first).resolves.toBe('value');
  });

  it('restores previous callback after resolution', async () => {
    setupFakeDom();
    const previousFn = vi.fn();
    getWindowRecord().onRestore = previousFn;

    const promise = loadWindowCallbackScript({
      src: 'https://example.com/restore.js',
      callbackName: 'onRestore',
      getResolvedValue: () => 'done'
    });

    (getWindowRecord().onRestore as (...args: unknown[]) => void)('arg1');

    await expect(promise).resolves.toBe('done');
    expect(previousFn).toHaveBeenCalledWith('arg1');
    expect(getWindowRecord().onRestore).toBe(previousFn);
  });

  it('deletes callback when no previous callback existed', async () => {
    setupFakeDom();

    const promise = loadWindowCallbackScript({
      src: 'https://example.com/delete-cb.js',
      callbackName: 'onDeleteCb',
      getResolvedValue: () => 'resolved'
    });

    expect(getWindowRecord().onDeleteCb).toBeDefined();
    (getWindowRecord().onDeleteCb as (...args: unknown[]) => void)();

    await promise;
    expect(getWindowRecord().onDeleteCb).toBeUndefined();
  });

  it('cleans up callback on error', async () => {
    const { scripts } = setupFakeDom();

    const promise = loadWindowCallbackScript({
      src: 'https://example.com/error-cleanup.js',
      callbackName: 'onErrorCleanup',
      getResolvedValue: () => null
    });

    expect(getWindowRecord().onErrorCleanup).toBeDefined();
    scripts[0].onerror?.();
    await expect(promise).rejects.toThrow();
    expect(getWindowRecord().onErrorCleanup).toBeUndefined();
  });

  it('resets cache after error allowing retry', async () => {
    const { head, scripts } = setupFakeDom();

    const first = loadWindowCallbackScript({
      src: 'https://example.com/retry-cb.js',
      callbackName: 'onRetryCb',
      getResolvedValue: () => 'value'
    });

    scripts[0].onerror?.();
    await expect(first).rejects.toThrow();

    const second = loadWindowCallbackScript({
      src: 'https://example.com/retry-cb.js',
      callbackName: 'onRetryCb',
      getResolvedValue: () => 'retried'
    });

    expect(head.appendChild).toHaveBeenCalledTimes(2);
    (getWindowRecord().onRetryCb as (...args: unknown[]) => void)();
    await expect(second).resolves.toBe('retried');
  });
});

describe('reloadExternalScript', () => {
  it('removes an existing script and appends a fresh one', () => {
    const { head, scripts } = setupFakeDom();

    const first = reloadExternalScript('https://example.com/reload.js');
    expect(scripts).toHaveLength(1);

    const second = reloadExternalScript('https://example.com/reload.js');
    expect(head.appendChild).toHaveBeenCalledTimes(2);
    expect(scripts).toHaveLength(1);
    expect(second).not.toBe(first);
  });

  it('returns a new script element with correct src and async', () => {
    setupFakeDom();

    const script = reloadExternalScript('https://example.com/new.js');
    expect(script.src).toBe('https://example.com/new.js');
    expect(script.async).toBe(true);
  });

  it('works when no existing script is found', () => {
    const { head } = setupFakeDom();

    const script = reloadExternalScript('https://example.com/fresh.js');
    expect(head.appendChild).toHaveBeenCalledTimes(1);
    expect(script.src).toBe('https://example.com/fresh.js');
  });

  it('clears pending caches so subsequent loads are not deduplicated', async () => {
    const { scripts } = setupFakeDom();

    const loadPromise = loadExternalScript({ src: 'https://example.com/clear-cache.js' });
    scripts[0].onload?.();
    await loadPromise;

    reloadExternalScript('https://example.com/clear-cache.js');

    // After reload, loadExternalScript should not return the old cached promise
    const newPromise = loadExternalScript({ src: 'https://example.com/clear-cache.js' });
    expect(newPromise).not.toBe(loadPromise);

    // The reloaded script is already in DOM, so loadExternalScript reuses it
    scripts[scripts.length - 1].onload?.();
    await expect(newPromise).resolves.toBeUndefined();
  });
});
