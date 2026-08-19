// Wires the Postgres-backed Overpass cache into the MCP package.
//
// packages/mcp deliberately has no database dependency, so the store is
// injected at startup. The agent does this in its own entrypoint; anything in
// the app that reaches an MCP source must import this first, or it silently
// bypasses the cache and refetches from Overpass on every request.
import { prismaScopeCache } from '@travel-architect/db';
import { registerScopeCache } from '@travel-architect/mcp';

registerScopeCache(prismaScopeCache);
