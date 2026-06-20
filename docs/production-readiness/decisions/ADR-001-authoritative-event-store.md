# ADR-001: ClickHouse Is the Authoritative Event Store

- Status: Accepted
- Date: 2026-06-20
- Related gaps: DATA-001, DATA-003, DATA-004, MIG-001, DR-001

## Context

The current engine treats ClickHouse insertion, Neo4j inference, and processed
Kafka publication as side effects of one source message. They cannot be committed
atomically and have independent failure behavior. Requiring all three writes
before committing a source offset would couple ingestion availability to every
projection and still would not create a real distributed transaction.

## Decision

Kafka is the durable transport boundary. ClickHouse is the authoritative event
history. Source offsets advance only after an idempotent ClickHouse batch is
acknowledged.

Neo4j causal graphs and live/processed streams are independently checkpointed,
rebuildable projections. They may lag without blocking authoritative ingestion.

## Consequences

- Stable event identity and idempotent ClickHouse writes are prerequisites.
- Projection lag and failure require explicit metrics and alerts.
- A supported graph rebuild path is mandatory.
- Query behavior must acknowledge projection freshness.
- ClickHouse backup/restore becomes a critical recovery control.
- No cross-system distributed transaction will be introduced.

## Revisit When

Revisit only if ClickHouse cannot meet measured authoritative ingestion or
recovery requirements and a replacement event store is selected through a new
decision record.
