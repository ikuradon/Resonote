import type {
  AddressableHandle,
  AddressableHandleInput,
  EntityHandleRuntime,
  EventHandle,
  EventHandleInput,
  RelayHintsHandle,
  RelaySetHandle,
  RelaySetSubject,
  UserHandle,
  UserHandleInput
} from './entity-handles.js';
import { createEntityHandleFactories } from './entity-handles.js';
import type {
  AuftaktRuntimePlugin,
  AuftaktRuntimePluginRegistration,
  AuftaktRuntimePluginRegistry
} from './plugin-api.js';
import { createAuftaktRuntimePluginRegistry } from './plugin-api.js';

export interface AuftaktRuntimeCoordinator {
  getEvent(input: EventHandleInput): EventHandle;
  getUser(input: UserHandleInput): UserHandle;
  getAddressable(input: AddressableHandleInput): AddressableHandle;
  getRelaySet(subject: RelaySetSubject): RelaySetHandle;
  getRelayHints(eventId: string): RelayHintsHandle;
  registerPlugin(plugin: AuftaktRuntimePlugin): Promise<AuftaktRuntimePluginRegistration>;
  getReadModel<TReadModel>(name: string): TReadModel;
  getFlow<TFlow>(name: string): TFlow;
}

export interface CreateAuftaktRuntimeCoordinatorOptions {
  readonly entityHandleRuntime: EntityHandleRuntime;
  readonly builtInPlugins?: readonly AuftaktRuntimePlugin[];
}

export function createAuftaktRuntimeCoordinator({
  entityHandleRuntime,
  builtInPlugins = []
}: CreateAuftaktRuntimeCoordinatorOptions): AuftaktRuntimeCoordinator {
  const entityHandles = createEntityHandleFactories(entityHandleRuntime);
  const pluginRegistry = createAuftaktRuntimePluginRegistry(entityHandles);

  registerBuiltInPlugins(pluginRegistry, builtInPlugins);

  return {
    getEvent: entityHandles.getEvent,
    getUser: entityHandles.getUser,
    getAddressable: entityHandles.getAddressable,
    getRelaySet: entityHandles.getRelaySet,
    getRelayHints: entityHandles.getRelayHints,
    registerPlugin: (plugin) => pluginRegistry.registerPlugin(plugin),
    getReadModel: (name) => pluginRegistry.getReadModel(name),
    getFlow: (name) => pluginRegistry.getFlow(name)
  };
}

function registerBuiltInPlugins(
  pluginRegistry: Pick<AuftaktRuntimePluginRegistry, 'registerPluginSynchronously'>,
  plugins: readonly AuftaktRuntimePlugin[]
): void {
  for (const plugin of plugins) {
    const registration = pluginRegistry.registerPluginSynchronously(plugin);
    if (!registration.enabled) {
      throw registration.error ?? new Error(`Failed to register built-in plugin: ${plugin.name}`);
    }
  }
}
