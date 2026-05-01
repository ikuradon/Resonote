# @auftakt/adapter-dexie

Dexie-backed durable event store for the strict Auftakt coordinator pipeline.

- Owns Dexie schema, migrations, durable query APIs, and maintenance APIs.
- Uses vocabulary from `@auftakt/core`.
- Does not own relay transport, UI state, or feature-specific read models.
