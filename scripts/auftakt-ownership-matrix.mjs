export const ownershipClassifications = [
  'protocol/domain helper',
  'adapter-specific',
  'compatibility shim',
  'app-owned'
];

/** @type {Record<string, { classification: string; owner: string; disposition: string }>} */
export const nostrOwnershipMatrix = {
  'src/shared/auftakt/cached-read.svelte.ts': {
    classification: 'adapter-specific',
    owner: 'shared/auftakt facade cached read driver',
    disposition: 'retain as internal coordinator-backed cached read runtime'
  },
  'src/shared/auftakt/cached-read.test.ts': {
    classification: 'app-owned',
    owner: 'app test harness',
    disposition: 'retain as regression coverage for facade-owned cached read behavior'
  },
  'src/shared/nostr/client-integration.test.ts': {
    classification: 'app-owned',
    owner: 'app integration test harness',
    disposition: 'retain as migration proof for relay session behavior'
  },
  'src/shared/nostr/client.test.ts': {
    classification: 'app-owned',
    owner: 'app test harness',
    disposition: 'retain as regression coverage for shared client wrapper'
  },
  'src/shared/nostr/client.ts': {
    classification: 'adapter-specific',
    owner: 'shared/nostr adapter runtime',
    disposition: 'migrate toward package/runtime-owned session facade'
  },
  'src/shared/nostr/materialized-latest.test.ts': {
    classification: 'app-owned',
    owner: 'app test harness',
    disposition: 'retain as regression coverage for materialized latest-event bridge'
  },
  'src/shared/nostr/materialized-latest.ts': {
    classification: 'adapter-specific',
    owner: 'shared/nostr read/query adapter',
    disposition: 'retain as internal bridge from shared client wrapper to materialized query path'
  },
  'src/shared/nostr/content-link.test.ts': {
    classification: 'app-owned',
    owner: 'app test harness',
    disposition: 'retain as regression coverage for public content-link facade'
  },
  'src/shared/nostr/content-link.ts': {
    classification: 'protocol/domain helper',
    owner: 'shared/nostr public protocol helpers',
    disposition: 'retain as stable public helper facade'
  },
  'src/shared/nostr/content-parser.test.ts': {
    classification: 'app-owned',
    owner: 'app test harness',
    disposition: 'retain as regression coverage for protocol/content parsing'
  },
  'src/shared/nostr/content-parser.ts': {
    classification: 'protocol/domain helper',
    owner: 'shared/nostr public protocol helpers',
    disposition: 'retain as protocol/content parsing helper'
  },
  'src/shared/nostr/event-db.test.ts': {
    classification: 'app-owned',
    owner: 'app test harness',
    disposition: 'retain as regression coverage for local event store adapter'
  },
  'src/shared/nostr/event-db.ts': {
    classification: 'adapter-specific',
    owner: 'shared/nostr local storage adapter',
    disposition: 'migrate toward package-owned store boundary'
  },
  'src/shared/nostr/events.test.ts': {
    classification: 'app-owned',
    owner: 'app test harness',
    disposition: 'retain as regression coverage for event builder helpers'
  },
  'src/shared/nostr/events.ts': {
    classification: 'protocol/domain helper',
    owner: 'shared/nostr public protocol helpers',
    disposition: 'retain as app-facing event builder helper'
  },
  'src/shared/nostr/helpers.test.ts': {
    classification: 'app-owned',
    owner: 'app test harness',
    disposition: 'retain as regression coverage for helper contracts'
  },
  'src/shared/nostr/helpers.ts': {
    classification: 'protocol/domain helper',
    owner: 'shared/nostr public protocol helpers',
    disposition: 'retain as canonical helper implementation'
  },
  'src/shared/nostr/nip05.test.ts': {
    classification: 'app-owned',
    owner: 'app test harness',
    disposition: 'retain as regression coverage for browser NIP-05 verification'
  },
  'src/shared/nostr/nip05.ts': {
    classification: 'adapter-specific',
    owner: 'shared/nostr browser verification adapter',
    disposition: 'keep app-owned until a dedicated verification owner replaces it'
  },
  'src/shared/nostr/nip19-decode.test.ts': {
    classification: 'app-owned',
    owner: 'app test harness',
    disposition: 'retain as regression coverage for public nip19 facade'
  },
  'src/shared/nostr/nip19-decode.ts': {
    classification: 'protocol/domain helper',
    owner: 'shared/nostr public protocol helpers',
    disposition: 'retain as stable public helper facade'
  },
  'src/shared/nostr/pending-publishes.test.ts': {
    classification: 'app-owned',
    owner: 'app test harness',
    disposition: 'retain as regression coverage for pending publish queue'
  },
  'src/shared/nostr/pending-publishes.ts': {
    classification: 'adapter-specific',
    owner: 'shared/nostr offline publish adapter',
    disposition: 'migrate once reconcile and queue ownership are settled'
  },
  'src/shared/nostr/publish-signed.test.ts': {
    classification: 'app-owned',
    owner: 'app test harness',
    disposition: 'retain as regression coverage for signed publish bridge'
  },
  'src/shared/nostr/publish-signed.ts': {
    classification: 'adapter-specific',
    owner: 'shared/nostr publish bridge',
    disposition: 'migrate once offline queue and publish owner split is finalized'
  },
  'src/shared/nostr/query.test.ts': {
    classification: 'app-owned',
    owner: 'app test harness',
    disposition: 'retain as regression coverage for read/query helper'
  },
  'src/shared/nostr/query.ts': {
    classification: 'adapter-specific',
    owner: 'shared/nostr read/query adapter',
    disposition: 'migrate to canonical descriptor/request-key runtime path'
  },
  'src/shared/nostr/relay-integration.test.ts': {
    classification: 'app-owned',
    owner: 'app integration test harness',
    disposition: 'retain as migration proof for live relay integration behavior'
  },
  'src/shared/nostr/relays-config.test.ts': {
    classification: 'app-owned',
    owner: 'app test harness',
    disposition: 'retain as regression coverage for relay-config bridge'
  },
  'src/shared/nostr/relays-config.ts': {
    classification: 'adapter-specific',
    owner: 'shared/nostr relay configuration adapter',
    disposition: 'retain as active relay-config bridge/runtime dependency'
  },
  'src/shared/nostr/relays.test.ts': {
    classification: 'app-owned',
    owner: 'app test harness',
    disposition: 'retain as regression coverage for default relay facade'
  },
  'src/shared/nostr/relays.ts': {
    classification: 'protocol/domain helper',
    owner: 'shared/nostr public protocol helpers',
    disposition: 'retain as stable default-relay public facade'
  },
  'src/shared/nostr/test-relays.ts': {
    classification: 'app-owned',
    owner: 'app test harness',
    disposition: 'retain as shared test-only relay fixture'
  },
  'src/shared/nostr/user-relays.test.ts': {
    classification: 'app-owned',
    owner: 'app test harness',
    disposition:
      'retain as intentional test-only coverage for residual legacy user-relays alias until the alias file is deleted'
  },
  'src/shared/nostr/user-relays.ts': {
    classification: 'adapter-specific',
    owner: 'shared/nostr relay configuration adapter',
    disposition:
      'intentional residual legacy alias for test-only coverage; runtime consumers are already cut over'
  }
};
