import type { LogicalRequestDescriptor, RequestKey } from './vocabulary.js';

export type Filter = Record<string, unknown>;

export interface RelayReadOverlayOptions {
  readonly relays: readonly string[];
  readonly includeDefaultReadRelays?: boolean;
}

export interface FetchBackwardOptions {
  readonly overlay?: RelayReadOverlayOptions;
  readonly timeoutMs?: number;
  readonly rejectOnError?: boolean;
}

export interface RuntimeRequestDescriptorOptions {
  readonly mode: 'backward' | 'forward';
  readonly filters: readonly Filter[];
  readonly overlay?: RelayReadOverlayOptions;
  readonly scope?: string;
}

const REQUEST_KEY_VERSION = 'v1';

const WINDOW_KEYS = new Set(['limit', 'since', 'until']);

function stableSortStrings(values: readonly string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function normalizePrimitiveArray(values: readonly unknown[]): readonly unknown[] {
  if (values.every((value) => typeof value === 'string')) {
    return stableSortStrings(values as readonly string[]);
  }
  if (values.every((value) => typeof value === 'number')) {
    return [...values].sort((left, right) => (left as number) - (right as number));
  }
  return values.map((value) => normalizeValue(value));
}

function normalizeObjectEntries(input: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  const keys = Object.keys(input).sort((left, right) => left.localeCompare(right));
  for (const key of keys) {
    normalized[key] = normalizeValue(input[key]);
  }
  return normalized;
}

function normalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return normalizePrimitiveArray(value);
  if (value && typeof value === 'object')
    return normalizeObjectEntries(value as Record<string, unknown>);
  return value;
}

function splitSelectorAndWindow(filter: Filter): {
  selector: Record<string, unknown>;
  window: Record<string, unknown>;
} {
  const selector: Record<string, unknown> = {};
  const window: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(filter)) {
    if (WINDOW_KEYS.has(key)) {
      window[key] = raw;
      continue;
    }
    selector[key] = raw;
  }
  return { selector: normalizeObjectEntries(selector), window: normalizeObjectEntries(window) };
}

function toStableJson(value: unknown): string {
  return JSON.stringify(normalizeValue(value));
}

function hashRequestDescriptor(payload: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < payload.length; index += 1) {
    hash ^= payload.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function buildLogicalRequestDescriptor(
  options: RuntimeRequestDescriptorOptions
): LogicalRequestDescriptor {
  const selectorFilters = options.filters.map((filter) => splitSelectorAndWindow(filter).selector);
  const windowFilters = options.filters.map((filter) => splitSelectorAndWindow(filter).window);

  return {
    mode: options.mode,
    filters: selectorFilters,
    overlay: options.overlay
      ? {
          relays: stableSortStrings(options.overlay.relays),
          includeDefaultReadRelays: options.overlay.includeDefaultReadRelays ?? true
        }
      : undefined,
    scope: options.scope,
    window: {
      cursor: toStableJson(windowFilters),
      limit: null
    }
  };
}

export function createRuntimeRequestKey(options: RuntimeRequestDescriptorOptions): RequestKey {
  const descriptor = buildLogicalRequestDescriptor(options);
  const encoded = toStableJson(descriptor);
  const digest = hashRequestDescriptor(encoded);
  return `rq:${REQUEST_KEY_VERSION}:${digest}` as RequestKey;
}
