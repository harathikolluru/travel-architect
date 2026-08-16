import 'dotenv/config';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prismaScopeCache } from '@travel-architect/db';
import { registerScopeCache } from '@travel-architect/mcp';

// Wire the persistent places cache before any agent run. Importing this module
// is what activates it, so every entrypoint that loads env gets it for free.
registerScopeCache(prismaScopeCache);

/** Skills live in agent/.claude/skills — the SDK resolves them relative to cwd. */
export const AGENT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const AGENT_MODEL = process.env.AGENT_MODEL ?? 'claude-sonnet-5';

/** Hard ceiling per run (Bar 7). A runaway loop stops costing money here. */
export const MAX_TURNS = Number(process.env.AGENT_MAX_TURNS ?? 60);
export const MAX_COST_USD = Number(process.env.AGENT_MAX_COST_USD ?? 2);

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error('ANTHROPIC_API_KEY is not set — see .env.example');
}
