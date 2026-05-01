import type {
  NamedRegistration,
  NamedRegistrationRegistry,
  ProjectionDefinition
} from '@auftakt/core';
import {
  createNamedRegistrationRegistry,
  createProjectionRegistry,
  defineProjection
} from '@auftakt/core';

import type { EntityHandleFactories } from './entity-handles.js';

export type AuftaktRuntimePluginApiVersion = 'v1';

export type AuftaktRuntimePluginModels = EntityHandleFactories;

export interface AuftaktRuntimePluginApi {
  readonly apiVersion: AuftaktRuntimePluginApiVersion;
  readonly models: AuftaktRuntimePluginModels;
  registerProjection(definition: ProjectionDefinition): void;
  registerReadModel<TReadModel>(name: string, readModel: TReadModel): void;
  registerFlow<TFlow>(name: string, flow: TFlow): void;
}

export interface AuftaktRuntimePlugin {
  readonly name: string;
  readonly apiVersion: AuftaktRuntimePluginApiVersion;
  setup(api: AuftaktRuntimePluginApi): void | Promise<void>;
}

export interface AuftaktRuntimePluginRegistration {
  readonly pluginName: string;
  readonly apiVersion: AuftaktRuntimePluginApiVersion;
  readonly enabled: boolean;
  readonly error?: Error;
}

export interface AuftaktRuntimePluginRegistry {
  readonly models: AuftaktRuntimePluginModels;
  registerPlugin(plugin: AuftaktRuntimePlugin): Promise<AuftaktRuntimePluginRegistration>;
  registerPluginSynchronously(plugin: AuftaktRuntimePlugin): AuftaktRuntimePluginRegistration;
  getReadModel<TReadModel>(name: string): TReadModel;
  getFlow<TFlow>(name: string): TFlow;
}

interface PendingPluginRegistrations {
  readonly projections: ProjectionDefinition[];
  readonly readModels: Array<NamedRegistration>;
  readonly flows: Array<NamedRegistration>;
}

export const AUFTAKT_RUNTIME_PLUGIN_API_VERSION: AuftaktRuntimePluginApiVersion = 'v1';

export async function registerRuntimePlugin(
  coordinator: Pick<AuftaktRuntimePluginRegistry, 'registerPlugin'>,
  plugin: AuftaktRuntimePlugin
): Promise<AuftaktRuntimePluginRegistration> {
  return coordinator.registerPlugin(plugin);
}

export function createAuftaktRuntimePluginRegistry(
  models: AuftaktRuntimePluginModels
): AuftaktRuntimePluginRegistry {
  const projectionRegistry = createProjectionRegistry();
  const readModelRegistry = createNamedRegistrationRegistry('Read model');
  const flowRegistry = createNamedRegistrationRegistry('Flow');
  const pluginNames = createPluginNameRegistry();

  const registerPlugin = async (
    plugin: AuftaktRuntimePlugin
  ): Promise<AuftaktRuntimePluginRegistration> => {
    const pending = createPendingPluginRegistrations();

    try {
      assertSupportedPluginVersion(plugin);
      pluginNames.reserve(plugin.name);
      await plugin.setup(createPluginRegistrationApi(pending, models));
      validatePluginRegistrations(projectionRegistry, readModelRegistry, flowRegistry, pending);
      commitPluginRegistrations(projectionRegistry, readModelRegistry, flowRegistry, pending);
      pluginNames.commit(plugin.name);

      return successfulPluginRegistration(plugin.name);
    } catch (error) {
      pluginNames.rollback(plugin.name);
      return failedPluginRegistration(plugin.name, error);
    }
  };

  const registerPluginSynchronously = (
    plugin: AuftaktRuntimePlugin
  ): AuftaktRuntimePluginRegistration => {
    const pending = createPendingPluginRegistrations();

    try {
      assertSupportedPluginVersion(plugin);
      pluginNames.reserve(plugin.name);
      const setupResult = plugin.setup(createPluginRegistrationApi(pending, models));
      if (isPromiseLike(setupResult)) {
        throw new Error(`Built-in plugin setup must be synchronous: ${plugin.name}`);
      }
      validatePluginRegistrations(projectionRegistry, readModelRegistry, flowRegistry, pending);
      commitPluginRegistrations(projectionRegistry, readModelRegistry, flowRegistry, pending);
      pluginNames.commit(plugin.name);

      return successfulPluginRegistration(plugin.name);
    } catch (error) {
      pluginNames.rollback(plugin.name);
      return failedPluginRegistration(plugin.name, error);
    }
  };

  return {
    models,
    registerPlugin,
    registerPluginSynchronously,
    getReadModel<TReadModel>(name: string): TReadModel {
      const registration = readModelRegistry.get(name);
      if (!registration) {
        throw new Error(`Read model is not registered: ${name}`);
      }
      return registration.value as TReadModel;
    },
    getFlow<TFlow>(name: string): TFlow {
      const registration = flowRegistry.get(name);
      if (!registration) {
        throw new Error(`Flow is not registered: ${name}`);
      }
      return registration.value as TFlow;
    }
  };
}

function createPluginNameRegistry(): {
  reserve(pluginName: string): void;
  commit(pluginName: string): void;
  rollback(pluginName: string): void;
} {
  const registered = new Set<string>();
  const pending = new Set<string>();

  return {
    reserve(pluginName) {
      if (registered.has(pluginName) || pending.has(pluginName)) {
        throw new Error(`Plugin already registered: ${pluginName}`);
      }
      pending.add(pluginName);
    },
    commit(pluginName) {
      pending.delete(pluginName);
      registered.add(pluginName);
    },
    rollback(pluginName) {
      pending.delete(pluginName);
    }
  };
}

function assertSupportedPluginVersion(plugin: AuftaktRuntimePlugin): void {
  if (plugin.apiVersion !== AUFTAKT_RUNTIME_PLUGIN_API_VERSION) {
    throw new Error(`Unsupported plugin API version for ${plugin.name}: ${plugin.apiVersion}`);
  }
}

function createPendingPluginRegistrations(): PendingPluginRegistrations {
  return {
    projections: [],
    readModels: [],
    flows: []
  };
}

function createPluginRegistrationApi(
  pending: PendingPluginRegistrations,
  models: AuftaktRuntimePluginModels
): AuftaktRuntimePluginApi {
  return {
    apiVersion: AUFTAKT_RUNTIME_PLUGIN_API_VERSION,
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

function validatePluginRegistrations(
  projectionRegistry: ReturnType<typeof createProjectionRegistry>,
  readModelRegistry: NamedRegistrationRegistry,
  flowRegistry: NamedRegistrationRegistry,
  pending: PendingPluginRegistrations
): void {
  const pendingProjectionNames = new Set<string>();
  for (const definition of pending.projections) {
    const normalized = defineProjection(definition);
    if (projectionRegistry.get(normalized.name) || pendingProjectionNames.has(normalized.name)) {
      throw new Error(`Projection already registered: ${normalized.name}`);
    }
    pendingProjectionNames.add(normalized.name);
  }

  validateNamedPendingRegistrations('Read model', readModelRegistry, pending.readModels);
  validateNamedPendingRegistrations('Flow', flowRegistry, pending.flows);
}

function validateNamedPendingRegistrations(
  label: string,
  registry: NamedRegistrationRegistry,
  registrations: readonly NamedRegistration[]
): void {
  const pendingNames = new Set<string>();

  for (const registration of registrations) {
    const name = registration.name.trim();
    if (!name) {
      throw new Error(`${label} name is required`);
    }
    if (registry.get(name) || pendingNames.has(name)) {
      throw new Error(`${label} already registered: ${name}`);
    }
    pendingNames.add(name);
  }
}

function commitPluginRegistrations(
  projectionRegistry: ReturnType<typeof createProjectionRegistry>,
  readModelRegistry: NamedRegistrationRegistry,
  flowRegistry: NamedRegistrationRegistry,
  pending: PendingPluginRegistrations
): void {
  for (const definition of pending.projections) {
    projectionRegistry.register(definition);
  }
  for (const registration of pending.readModels) {
    readModelRegistry.register(registration);
  }
  for (const registration of pending.flows) {
    flowRegistry.register(registration);
  }
}

function successfulPluginRegistration(pluginName: string): AuftaktRuntimePluginRegistration {
  return {
    pluginName,
    apiVersion: AUFTAKT_RUNTIME_PLUGIN_API_VERSION,
    enabled: true
  };
}

function failedPluginRegistration(
  pluginName: string,
  error: unknown
): AuftaktRuntimePluginRegistration {
  return {
    pluginName,
    apiVersion: AUFTAKT_RUNTIME_PLUGIN_API_VERSION,
    enabled: false,
    error: normalizePluginError(error)
  };
}

function normalizePluginError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error(typeof error === 'string' ? error : 'Plugin registration failed');
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'then' in value &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}
