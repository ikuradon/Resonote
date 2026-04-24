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

export interface RequestExecutionPlanOptions extends RuntimeRequestDescriptorOptions {
  readonly requestKey?: RequestKey;
  readonly coalescingScope?: string;
}

export interface RequestOptimizerCapabilities {
  readonly maxFiltersPerShard?: number | null;
  readonly maxSubscriptions?: number | null;
}

export interface OptimizedRequestShard {
  readonly shardIndex: number;
  readonly shardKey: string;
  readonly filters: readonly Filter[];
}

export interface OptimizedLogicalRequestPlan {
  readonly descriptor: LogicalRequestDescriptor;
  readonly requestKey: RequestKey;
  readonly logicalKey: string;
  readonly shards: readonly OptimizedRequestShard[];
  readonly capabilities: RequestOptimizerCapabilities;
}

const REQUEST_KEY_VERSION = 'v1';
const DEFAULT_REQUEST_COALESCING_SCOPE = 'timeline:app';

export const REPAIR_REQUEST_COALESCING_SCOPE = 'timeline:repair';

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

function normalizeTransportFilters(filters: readonly Filter[]): Filter[] {
  return filters.map((filter) => normalizeObjectEntries(filter) as Filter);
}

function stableSortFilters(filters: readonly Filter[]): Filter[] {
  return [...filters].sort((left, right) => toStableJson(left).localeCompare(toStableJson(right)));
}

function resolveMaxFiltersPerShard(
  capabilities: RequestOptimizerCapabilities,
  filterCount: number
): number {
  const candidate = capabilities.maxFiltersPerShard;
  if (candidate == null || !Number.isFinite(candidate) || candidate < 1) {
    return Math.max(filterCount, 1);
  }
  return Math.max(1, Math.floor(candidate));
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

export function buildRequestExecutionPlan(
  options: RequestExecutionPlanOptions,
  capabilities: RequestOptimizerCapabilities = {}
): OptimizedLogicalRequestPlan {
  const descriptor = buildLogicalRequestDescriptor(options);
  const requestKey = options.requestKey ?? createRuntimeRequestKey(options);
  const normalizedFilters = stableSortFilters(normalizeTransportFilters(options.filters));
  const coalescingScope = options.coalescingScope ?? DEFAULT_REQUEST_COALESCING_SCOPE;
  const logicalKey = `lq:${REQUEST_KEY_VERSION}:${hashRequestDescriptor(
    toStableJson({
      coalescingScope,
      mode: options.mode,
      filters: normalizedFilters,
      overlay: descriptor.overlay
    })
  )}`;
  const shardSize = resolveMaxFiltersPerShard(capabilities, normalizedFilters.length);
  const shards: OptimizedRequestShard[] = [];

  for (let index = 0; index < normalizedFilters.length; index += shardSize) {
    const shardIndex = shards.length;
    const shardFilters = normalizedFilters.slice(index, index + shardSize);
    shards.push({
      shardIndex,
      shardKey: `shard:${REQUEST_KEY_VERSION}:${hashRequestDescriptor(
        toStableJson({ logicalKey, shardIndex, filters: shardFilters })
      )}`,
      filters: shardFilters
    });
  }

  return {
    descriptor,
    requestKey,
    logicalKey,
    shards,
    capabilities: {
      maxFiltersPerShard: capabilities.maxFiltersPerShard ?? null,
      maxSubscriptions: capabilities.maxSubscriptions ?? null
    }
  };
}
