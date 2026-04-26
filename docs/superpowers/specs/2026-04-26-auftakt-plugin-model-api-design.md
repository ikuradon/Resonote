# Auftakt Plugin Model API Design

Date: 2026-04-26
Branch: feat/auftakt

## Goal

Close the strict-gap follow-up for NDK-like API convenience on the extension
boundary by giving plugins coordinator-mediated model handles.

Plugins can already register projections, read models, and flows. They cannot
currently build those extensions from the same high-level event, user,
addressable, relay-set, and relay-hint handles that the coordinator owns. This
slice adds that convenience without exposing raw storage, raw relay sessions,
request objects, materializer queues, or transport packets.

## Non-Goals

- Add a broad NDK-compatible class hierarchy.
- Expose package-root value factories such as `getEvent()` or `getUser()`.
- Expose `getEventsDB()`, `openEventsDb()`, `getRxNostr()`, request builders,
  materializer queues, or relay gateway internals to plugins.
- Change app-facing read and publish call signatures.
- Change built-in read model, flow, or projection names.
- Add UI behavior.

## Current Context

`@auftakt/resonote` already has high-level entity handles:

- `EventHandle`
- `UserHandle`
- `AddressableHandle`
- `RelaySetHandle`
- `RelayHintsHandle`

The coordinator already exposes those handles as methods:

- `coordinator.getEvent(input)`
- `coordinator.getUser(input)`
- `coordinator.getAddressable(input)`
- `coordinator.getRelaySet(subject)`
- `coordinator.getRelayHints(eventId)`

The package root exports the handle types, but not package-level value
factories. Plugin setup currently receives only:

- `apiVersion`
- `registerProjection`
- `registerReadModel`
- `registerFlow`

That keeps plugins isolated, but it also means plugin authors cannot assemble
read models and flows from coordinator-owned model access without capturing a
coordinator from outside the plugin API.

## Design

Add a `models` namespace to `ResonoteCoordinatorPluginApi`:

```ts
export interface ResonoteCoordinatorPluginModels {
  getEvent(input: EventHandleInput): EventHandle;
  getUser(input: UserHandleInput): UserHandle;
  getAddressable(input: AddressableHandleInput): AddressableHandle;
  getRelaySet(subject: RelaySetSubject): RelaySetHandle;
  getRelayHints(eventId: string): RelayHintsHandle;
}

export interface ResonoteCoordinatorPluginApi {
  readonly apiVersion: ResonoteCoordinatorPluginApiVersion;
  readonly models: ResonoteCoordinatorPluginModels;
  registerProjection(definition: ProjectionDefinition): void;
  registerReadModel<TReadModel>(name: string, readModel: TReadModel): void;
  registerFlow<TFlow>(name: string, flow: TFlow): void;
}
```

The `models` object is a thin wrapper around
`createEntityHandleFactories(...)`. It returns the same high-level handles that
the coordinator returns. Those handles preserve current behavior:

- reads go through coordinator materialization and settlement paths
- addressable reads use kind, author, and `#d` filters
- relay-set snapshots use core relay selection planning
- relay hints are read-only normalized snapshots
- invalid ids, pubkeys, relay URLs, kinds, and d-tags use existing handle
  validation

`models` is intentionally nested instead of flattening `getEvent` and friends
onto the top-level plugin API. The namespace makes the extension surface easier
to audit and keeps registration functions distinct from model access.

## Runtime Shape

Move or create the entity handle factories early enough inside
`createResonoteCoordinator()` that plugin registration can receive the `models`
namespace.

`createPluginRegistrationApi()` accepts the model namespace:

```ts
function createPluginRegistrationApi(
  pending: PendingPluginRegistrations,
  models: ResonoteCoordinatorPluginModels
): ResonoteCoordinatorPluginApi {
  return {
    apiVersion: RESONOTE_COORDINATOR_PLUGIN_API_VERSION,
    models,
    registerProjection(definition) {
      pending.projections.push(definition);
    },
    registerReadModel(name, readModel) {
      pending.readModels.push({ name, value: readModel });
    },
    registerFlow(name, flow) {
      pending.flows.push({ name, value: flow });
    }
  };
}
```

Both async external plugin registration and synchronous built-in plugin
registration receive the same API shape. Existing built-in plugins can ignore
`models`.

## Compatibility

This is a backward-compatible v1 extension. Existing plugins that use only
registration functions continue to work because `models` is additive.

The API version remains `v1`. A version bump is not needed because no existing
property is removed or renamed. Contract tests will update expected plugin API
keys so that the additive surface is intentional and guarded.

Package-root value exports remain unchanged. The public package surface
continues to export handle types and coordinator-owned helpers, not raw
standalone handle factories.

## Error Handling

Plugin setup failure remains isolated:

- if plugin setup throws after using `api.models`, the plugin registration is
  disabled
- pending projections, read models, and flows are not committed
- subsequent plugin registrations still run

Model handle validation errors occur when the plugin constructs invalid handles
or calls handle methods, using the existing entity handle validation behavior.
The plugin registration wrapper catches setup-time validation errors and returns
an unsuccessful registration.

The model namespace must not expose mutable storage or transport objects.
Isolation tests continue to forbid:

- `getRxNostr`
- `createRxBackwardReq`
- `createRxForwardReq`
- `getEventsDB`
- `openEventsDb`
- `materializerQueue`
- `relayGateway`
- raw relay packets

## Testing

Add or update focused contract tests:

- `packages/resonote/src/plugin-api.contract.test.ts` proves plugin setup
  receives `api.models` alongside registration methods.
- `packages/resonote/src/plugin-api.contract.test.ts` proves a plugin can
  register a read model or flow built from `api.models.getEvent()` and that
  fetching through the model delegates to coordinator read paths.
- `packages/resonote/src/plugin-api.contract.test.ts` proves package root
  exports `ResonoteCoordinatorPluginModels` as a type, not raw value factories.
- `packages/resonote/src/plugin-isolation.contract.test.ts` proves the new
  `models` namespace contains only the five high-level model handle factories
  and does not expose raw storage or transport handles.
- `scripts/check-auftakt-strict-goal-audit.test.ts` proves the strict audit gate
  requires plugin model API evidence.

Existing entity handle, plugin isolation, package public API, strict audit, and
package tests must keep passing.

## Strict Audit Update

Mark NDK-like model expansion as implemented for this strict follow-up slice,
with wording that stays scoped to plugin model convenience:

> Plugin model API now gives extensions coordinator-mediated event, user,
> addressable, relay-set, and relay-hint handles without exposing raw storage or
> transport handles.

The strict audit checker requires evidence from:

- `packages/resonote/src/runtime.ts`
- `packages/resonote/src/plugin-api.contract.test.ts`
- `packages/resonote/src/plugin-isolation.contract.test.ts`

## Completion Criteria

- Plugins receive `api.models`.
- `api.models` exposes only coordinator-mediated model handles.
- A plugin can build a read model or flow from `api.models.getEvent()`.
- Plugin setup failure isolation is preserved.
- Package root does not expose new standalone model value factories.
- Strict goal audit marks the plugin model API slice implemented and requires
  runtime/test evidence.
- Focused plugin tests, Resonote package tests, strict gates, migration proof,
  and package-wide tests pass.
