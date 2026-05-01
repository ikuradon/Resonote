export type RelayLifecycleMode = 'lazy' | 'lazy-keep';
export type RelayReconnectStrategy = 'exponential' | 'off';

export interface RelayLifecycleRetryOptions {
  readonly strategy?: RelayReconnectStrategy;
  readonly initialDelayMs?: number;
  readonly maxDelayMs?: number;
  readonly maxAttempts?: number;
}

export interface RelayLifecycleRetryPolicy {
  readonly strategy: RelayReconnectStrategy;
  readonly initialDelayMs: number;
  readonly maxDelayMs: number;
  readonly maxAttempts: number;
}

export interface RelayLifecycleOptions {
  readonly idleDisconnectMs?: number;
  readonly retry?: RelayLifecycleRetryOptions;
}

export interface RelayLifecyclePolicy {
  readonly mode: RelayLifecycleMode;
  readonly idleDisconnectMs: number;
  readonly retry: RelayLifecycleRetryPolicy;
}

export interface NormalizedRelayLifecycleOptions {
  readonly defaultRelay: RelayLifecyclePolicy;
  readonly temporaryRelay: RelayLifecyclePolicy;
}

const DEFAULT_IDLE_DISCONNECT_MS = 10_000;
const DEFAULT_RECONNECT_INITIAL_DELAY_MS = 0;
const DEFAULT_RECONNECT_MAX_DELAY_MS = 60_000;

export function normalizeRelayLifecycleOptions(
  options: RelayLifecycleOptions = {}
): NormalizedRelayLifecycleOptions {
  const idleDisconnectMs = normalizePositiveMs(
    options.idleDisconnectMs,
    DEFAULT_IDLE_DISCONNECT_MS
  );
  const retry = normalizeRetryPolicy(options.retry);

  return {
    defaultRelay: {
      mode: 'lazy-keep',
      idleDisconnectMs,
      retry
    },
    temporaryRelay: {
      mode: 'lazy',
      idleDisconnectMs,
      retry
    }
  };
}

export function calculateRelayReconnectDelay(
  attempt: number,
  retry: RelayLifecycleRetryPolicy
): number | null {
  if (retry.strategy === 'off') return null;
  if (!Number.isFinite(attempt) || attempt < 1) return retry.initialDelayMs;
  if (attempt > retry.maxAttempts) return null;

  const exponentialDelay = retry.initialDelayMs * 2 ** Math.max(0, attempt - 1);
  return Math.min(retry.maxDelayMs, exponentialDelay);
}

function normalizeRetryPolicy(
  options: RelayLifecycleRetryOptions | undefined
): RelayLifecycleRetryPolicy {
  return {
    strategy: options?.strategy ?? 'exponential',
    initialDelayMs: normalizeNonNegativeMs(
      options?.initialDelayMs,
      DEFAULT_RECONNECT_INITIAL_DELAY_MS
    ),
    maxDelayMs: normalizePositiveMs(options?.maxDelayMs, DEFAULT_RECONNECT_MAX_DELAY_MS),
    maxAttempts: normalizeMaxAttempts(options?.maxAttempts)
  };
}

function normalizePositiveMs(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) return fallback;
  return Math.floor(value);
}

function normalizeNonNegativeMs(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return fallback;
  return Math.floor(value);
}

function normalizeMaxAttempts(value: number | undefined): number {
  if (typeof value !== 'number') return Number.POSITIVE_INFINITY;
  if (value === Number.POSITIVE_INFINITY) return Number.POSITIVE_INFINITY;
  if (!Number.isFinite(value) || value < 0) return Number.POSITIVE_INFINITY;
  return Math.floor(value);
}
