# ADR 0001: Canonical HTTP API with MCP adapter

- Status: accepted for the pre-release architecture
- Date: 2026-08-02

## Context

Browser SDKs, widgets, human/operator clients, integrations, and coding agents
must observe the same tenant boundaries, state transitions, leases, optimistic
versions, and audit rules. Giving the MCP process direct database access would
create a second business and authorization layer.

## Decision

The versioned `/v1` HTTP API is the canonical business boundary. PostgreSQL and
object storage are implementation details of that service. The typed API client
is the shared integration library. The MCP server is a narrow adapter over that
client and has no database or object-storage credentials.

Agents search, fetch, claim, comment, add evidence, resolve, and—only with a
separately granted scope—close through the same endpoints as other clients. All
mutations require an expected record version. Resolution and closure remain
separate transitions.

## Consequences

- Domain fixes and authorization checks live in one service.
- HTTP/API compatibility becomes a long-lived public commitment.
- MCP availability depends on API availability and adds one network hop.
- Remote MCP OAuth and Streamable HTTP can be added later without changing
  business persistence or bypassing API scopes.
