import type { Filter, RequestKey, StoredEvent } from '@auftakt/core';
import { Observable } from 'rxjs';

import {
  buildRequestExecutionPlan,
  type ObservableLike,
  type QueryRuntime,
  type RelayRequestLike,
  type RelaySessionLike,
  type SessionRuntime,
  type SubscriptionLike
} from './request-planning.js';

export interface RuntimeRelayUseOptions {
  readonly on?: {
    readonly relays?: readonly string[];
    readonly defaultReadRelays?: boolean;
  };
}

export interface RuntimeManagedRelayRequest extends RelayRequestLike {
  readonly mode: 'backward' | 'forward';
  readonly requestKey?: RequestKey;
  readonly filters: Filter[];
  readonly closed: boolean;
  onChange(listener: () => void): () => void;
}

export interface SharedSubscriptionEntrySnapshot {
  readonly entryKey: string;
  readonly mode: 'backward' | 'forward';
  readonly filters: readonly Filter[];
  readonly useOptions?: RuntimeRelayUseOptions;
}

export interface RuntimeSubscriptionRegistryOptions<TEvent extends StoredEvent = StoredEvent> {
  readonly registryKey?: string;
  readonly queryRuntime?: QueryRuntime<TEvent>;
  readonly resolveUseOptions?: (
    entry: SharedSubscriptionEntrySnapshot
  ) => Promise<RuntimeRelayUseOptions | undefined>;
}

interface RegistryObserver {
  next?(packet: unknown): void;
  error?(error: unknown): void;
  complete?(): void;
}

interface RegistryConsumer {
  readonly observer: RegistryObserver;
  entryKey: string | null;
}

interface SharedSubscriptionEntry {
  readonly entryKey: string;
  readonly mode: 'backward' | 'forward';
  readonly filters: Filter[];
  readonly useOptions?: RuntimeRelayUseOptions;
  readonly transportRequest: RelayRequestLike;
  readonly consumers: Set<RegistryConsumer>;
  consumerCount: number;
  transportSubscription: SubscriptionLike | null;
  starting: boolean;
  completed: boolean;
}

const subscriptionRegistries = new WeakMap<
  SessionRuntime<StoredEvent>,
  Map<string, RuntimeSubscriptionRegistry>
>();

export function createRegistryBackedSessionRuntime<TEvent extends StoredEvent>(
  runtime: SessionRuntime<TEvent>,
  options: RuntimeSubscriptionRegistryOptions<TEvent> = {}
): SessionRuntime<TEvent> {
  const registry = getRuntimeSubscriptionRegistry(runtime as SessionRuntime<StoredEvent>, options);
  const queryRuntime = options.queryRuntime ?? runtime;

  return {
    fetchBackwardEvents: (...args) => queryRuntime.fetchBackwardEvents(...args),
    fetchBackwardFirst: (...args) => queryRuntime.fetchBackwardFirst(...args),
    fetchLatestEvent: (...args) => queryRuntime.fetchLatestEvent(...args),
    getEventsDB: () => queryRuntime.getEventsDB(),
    getRelaySession: async () => {
      const rawSession = await runtime.getRelaySession();
      const registrySession = registry.createRelaySession();
      return Object.assign(Object.create(rawSession as object), {
        use: (req: RelayRequestLike, useOptions?: RuntimeRelayUseOptions) =>
          registrySession.use(req, useOptions)
      }) as RelaySessionLike;
    },
    createBackwardReq: (requestOptions) => runtime.createBackwardReq(requestOptions),
    createForwardReq: (requestOptions) => runtime.createForwardReq(requestOptions),
    uniq: () => runtime.uniq(),
    merge: (...streams) => runtime.merge(...streams),
    getRelayConnectionState: (url) => runtime.getRelayConnectionState(url),
    observeRelayConnectionStates: (onPacket) => runtime.observeRelayConnectionStates(onPacket)
  };
}

function getRuntimeSubscriptionRegistry(
  runtime: SessionRuntime<StoredEvent>,
  options: RuntimeSubscriptionRegistryOptions = {}
): RuntimeSubscriptionRegistry {
  const registryKey = runtimeSubscriptionRegistryKey(options);
  const byKey =
    subscriptionRegistries.get(runtime) ?? new Map<string, RuntimeSubscriptionRegistry>();
  const existing = byKey.get(registryKey);
  if (existing) return existing;

  const registry = new RuntimeSubscriptionRegistry(runtime, options.resolveUseOptions);
  byKey.set(registryKey, registry);
  subscriptionRegistries.set(runtime, byKey);
  return registry;
}

function runtimeSubscriptionRegistryKey(options: RuntimeSubscriptionRegistryOptions): string {
  if (options.registryKey) return options.registryKey;
  return options.resolveUseOptions ? 'resolved' : 'direct';
}

function isRuntimeManagedRelayRequest(
  value: RelayRequestLike
): value is RuntimeManagedRelayRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    'mode' in value &&
    'filters' in value &&
    'closed' in value &&
    'onChange' in value
  );
}

function cloneFilters(filters: readonly Filter[]): Filter[] {
  return filters.map((filter) => ({ ...filter }));
}

function cloneUseOptions(options?: RuntimeRelayUseOptions): RuntimeRelayUseOptions | undefined {
  if (!options?.on) return undefined;
  return {
    on: {
      relays: options.on.relays ? [...options.on.relays] : undefined,
      defaultReadRelays: options.on.defaultReadRelays
    }
  };
}

function buildOverlay(options?: RuntimeRelayUseOptions):
  | {
      readonly relays: readonly string[];
      readonly includeDefaultReadRelays?: boolean;
    }
  | undefined {
  if (!options?.on) return undefined;
  return {
    relays: [...(options.on.relays ?? [])],
    includeDefaultReadRelays: options.on.defaultReadRelays
  };
}

function buildSharedSubscriptionEntryKey(
  request: RuntimeManagedRelayRequest,
  options?: RuntimeRelayUseOptions
): string {
  return buildRequestExecutionPlan({
    requestKey: request.requestKey as RequestKey,
    coalescingScope: request.coalescingScope,
    mode: request.mode,
    filters: request.filters,
    overlay: buildOverlay(options)
  }).logicalKey;
}

class RuntimeSubscriptionRegistry {
  private readonly entries = new Map<string, SharedSubscriptionEntry>();
  private rawSessionPromise: Promise<RelaySessionLike> | null = null;

  constructor(
    private readonly runtime: SessionRuntime<StoredEvent>,
    private readonly resolveUseOptions?: (
      entry: SharedSubscriptionEntrySnapshot
    ) => Promise<RuntimeRelayUseOptions | undefined>
  ) {}

  createRelaySession(): RelaySessionLike {
    return {
      use: (req, options) => this.use(req, options as RuntimeRelayUseOptions | undefined)
    };
  }

  private getRawSession(): Promise<RelaySessionLike> {
    if (!this.rawSessionPromise) {
      this.rawSessionPromise = this.runtime.getRelaySession();
    }
    return this.rawSessionPromise;
  }

  private use(req: RelayRequestLike, options?: RuntimeRelayUseOptions): ObservableLike<unknown> {
    return new Observable<unknown>((observer) => {
      const managedRequest = isRuntimeManagedRelayRequest(req) ? req : null;
      let disposed = false;
      let off = () => {};
      let rawSubscription: SubscriptionLike | null = null;
      let forwardFlushQueued = false;
      const consumer: RegistryConsumer = {
        observer,
        entryKey: null
      };

      const attachToRawSession = () => {
        void this.getRawSession()
          .then((session) => {
            if (disposed) return;
            rawSubscription = session.use(req, options).subscribe(observer);
          })
          .catch((error) => {
            observer.error?.(error);
          });
      };

      const syncConsumerEntry = () => {
        if (disposed) return;
        if (!managedRequest) {
          attachToRawSession();
          return;
        }
        if (!managedRequest.requestKey) {
          observer.error?.(
            new Error(
              `Relay request is missing canonical requestKey for ${managedRequest.mode} mode`
            )
          );
          return;
        }
        if (managedRequest.filters.length === 0) {
          this.detachConsumer(consumer);
          return;
        }
        if (managedRequest.mode === 'backward' && !managedRequest.closed) {
          return;
        }

        const entryKey = buildSharedSubscriptionEntryKey(managedRequest, options);
        if (consumer.entryKey === entryKey) return;

        this.detachConsumer(consumer);
        const entry = this.getOrCreateEntry(entryKey, managedRequest, options);
        if (!entry.consumers.has(consumer)) {
          entry.consumers.add(consumer);
          entry.consumerCount += 1;
        }
        consumer.entryKey = entryKey;
        this.ensureEntryStarted(entry);
      };

      const handleRequestChange = () => {
        if (!managedRequest) return;
        if (managedRequest.mode === 'backward') {
          syncConsumerEntry();
          return;
        }
        if (forwardFlushQueued) return;
        forwardFlushQueued = true;
        queueMicrotask(() => {
          forwardFlushQueued = false;
          syncConsumerEntry();
        });
      };

      if (managedRequest) {
        off = managedRequest.onChange(handleRequestChange);
        handleRequestChange();
      } else {
        attachToRawSession();
      }

      return () => {
        disposed = true;
        off();
        rawSubscription?.unsubscribe();
        this.detachConsumer(consumer);
      };
    }) as ObservableLike<unknown>;
  }

  private getOrCreateEntry(
    entryKey: string,
    request: RuntimeManagedRelayRequest,
    options?: RuntimeRelayUseOptions
  ): SharedSubscriptionEntry {
    const existing = this.entries.get(entryKey);
    if (existing) return existing;

    const transportRequest =
      request.mode === 'backward'
        ? this.runtime.createBackwardReq({
            requestKey: request.requestKey,
            coalescingScope: request.coalescingScope
          })
        : this.runtime.createForwardReq({
            requestKey: request.requestKey,
            coalescingScope: request.coalescingScope
          });
    const entry: SharedSubscriptionEntry = {
      entryKey,
      mode: request.mode,
      filters: cloneFilters(request.filters),
      useOptions: cloneUseOptions(options),
      transportRequest,
      consumers: new Set(),
      consumerCount: 0,
      transportSubscription: null,
      starting: false,
      completed: false
    };
    this.entries.set(entryKey, entry);
    return entry;
  }

  private ensureEntryStarted(entry: SharedSubscriptionEntry): void {
    if (entry.starting || entry.transportSubscription || entry.completed) {
      return;
    }
    entry.starting = true;

    void this.getRawSession()
      .then(async (session) => {
        if (!this.entries.has(entry.entryKey) || entry.consumerCount === 0) {
          return;
        }

        const resolvedUseOptions = entry.useOptions ?? (await this.resolveEntryUseOptions(entry));

        entry.transportSubscription = session
          .use(entry.transportRequest, resolvedUseOptions)
          .subscribe({
            next: (packet) => {
              for (const consumer of entry.consumers) {
                consumer.observer.next?.(packet);
              }
            },
            error: (error) => {
              for (const consumer of entry.consumers) {
                consumer.entryKey = null;
                consumer.observer.error?.(error);
              }
              this.finishEntry(entry.entryKey);
            },
            complete: () => {
              for (const consumer of entry.consumers) {
                consumer.entryKey = null;
                consumer.observer.complete?.();
              }
              this.finishEntry(entry.entryKey);
            }
          });

        for (const filter of entry.filters) {
          entry.transportRequest.emit(filter);
        }
        if (entry.mode === 'backward') {
          entry.transportRequest.over();
        }
      })
      .catch((error) => {
        for (const consumer of entry.consumers) {
          consumer.entryKey = null;
          consumer.observer.error?.(error);
        }
        this.finishEntry(entry.entryKey);
      })
      .finally(() => {
        entry.starting = false;
      });
  }

  private async resolveEntryUseOptions(
    entry: SharedSubscriptionEntry
  ): Promise<RuntimeRelayUseOptions | undefined> {
    return this.resolveUseOptions?.({
      entryKey: entry.entryKey,
      mode: entry.mode,
      filters: entry.filters,
      useOptions: entry.useOptions
    });
  }

  private detachConsumer(consumer: RegistryConsumer): void {
    const entryKey = consumer.entryKey;
    consumer.entryKey = null;
    if (!entryKey) return;

    const entry = this.entries.get(entryKey);
    if (!entry) return;

    if (entry.consumers.delete(consumer)) {
      entry.consumerCount = Math.max(0, entry.consumerCount - 1);
    }
    if (entry.consumerCount === 0) {
      entry.transportSubscription?.unsubscribe();
      this.finishEntry(entryKey);
    }
  }

  private finishEntry(entryKey: string): void {
    const entry = this.entries.get(entryKey);
    if (!entry) return;
    entry.completed = true;
    entry.transportSubscription = null;
    entry.consumerCount = 0;
    entry.consumers.clear();
    this.entries.delete(entryKey);
  }
}
