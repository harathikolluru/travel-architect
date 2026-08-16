// One agent run = one query() with the in-process travel-architect MCP server.
//
// Three enforcement layers guarantee the contract:
//   1. Zod at the tool boundary            (packages/contracts)
//   2. Grounding check in the save handler  (tools/save.ts)
//   3. The post-run assertion below — the plan must actually exist in the
//      database, whatever the agent claimed in prose.

import { createSdkMcpServer, query } from '@anthropic-ai/claude-agent-sdk';
import { prisma } from '@travel-architect/db';
import { AGENT_DIR, AGENT_MODEL, MAX_COST_USD, MAX_TURNS } from './env';
import { PLANNER_SYSTEM_PROMPT, planPrompt, replanPrompt, type ReplanTrigger } from './prompts';
import { createScopeCache, sourceTools } from './tools/sources';
import { saveTools } from './tools/save';
import { replanSaveTool } from './tools/save-replan';

export interface RunResult {
  planId: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  turns: number;
  durationMs: number;
}

async function runAgent(opts: {
  planId: string;
  prompt: string;
  kind: 'generate_plan' | 'replan';
  jobId?: string;
  verbose?: boolean;
}): Promise<Omit<RunResult, 'planId'> & { saved: boolean }> {
  const getScope = createScopeCache(opts.planId);
  let saved = false;
  const onSaved = () => {
    saved = true;
  };

  const save = saveTools({ planId: opts.planId, getScope, onSaved });
  const replanSave = replanSaveTool({ planId: opts.planId, getScope, onSaved });

  // Expose only the save tool that matches this run, so a re-plan cannot
  // accidentally rewrite the whole itinerary and vice versa.
  const saveToolForKind =
    opts.kind === 'generate_plan' ? save.saveItinerary : replanSave.saveReplan;

  const server = createSdkMcpServer({
    name: 'travel-architect',
    version: '0.1.0',
    tools: [...sourceTools(opts.planId, getScope), saveToolForKind],
  });

  const toolNames = [
    'mcp__travel-architect__get_trip_constraints',
    'mcp__travel-architect__get_destination_coverage',
    'mcp__travel-architect__search_places',
    'mcp__travel-architect__get_weather_forecast',
    'mcp__travel-architect__get_current_plan',
    opts.kind === 'generate_plan'
      ? 'mcp__travel-architect__save_itinerary'
      : 'mcp__travel-architect__save_replan',
  ];

  const started = Date.now();
  const result = { costUsd: 0, inputTokens: 0, outputTokens: 0, turns: 0, durationMs: 0, saved };

  const stream = query({
    prompt: opts.prompt,
    options: {
      model: AGENT_MODEL,
      systemPrompt: PLANNER_SYSTEM_PROMPT,
      cwd: AGENT_DIR, // .claude/skills/ lives here
      settingSources: ['project'],
      skills: 'all',
      mcpServers: { 'travel-architect': server },
      tools: toolNames,
      allowedTools: toolNames,
      permissionMode: 'bypassPermissions',
      maxTurns: MAX_TURNS,
    },
  });

  for await (const message of stream) {
    if (opts.verbose && message.type === 'assistant') {
      for (const block of message.message.content) {
        if (block.type === 'text' && block.text.trim()) {
          console.log(`  [agent] ${block.text.slice(0, 180)}`);
        }
        if (block.type === 'tool_use') console.log(`  [tool]  ${block.name}`);
      }
    }
    if (message.type === 'result') {
      result.costUsd = 'total_cost_usd' in message ? message.total_cost_usd : 0;
      result.turns = message.num_turns;
      result.durationMs = message.duration_ms;
      if ('usage' in message && message.usage) {
        result.inputTokens = message.usage.input_tokens ?? 0;
        result.outputTokens = message.usage.output_tokens ?? 0;
      }
    }
  }

  result.durationMs ||= Date.now() - started;
  result.saved = saved;

  await prisma.agentRunLog.create({
    data: {
      jobId: opts.jobId,
      planId: opts.planId,
      kind: opts.kind,
      model: AGENT_MODEL,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costUsd: result.costUsd,
      durationMs: result.durationMs,
    },
  });

  if (result.costUsd > MAX_COST_USD) {
    console.warn(
      `[agent] run cost $${result.costUsd.toFixed(2)} exceeded ceiling $${MAX_COST_USD}`,
    );
  }

  return result;
}

/** Generate the itinerary for a trip. Retries once with explicit feedback. */
export async function runPlan(
  planId: string,
  opts: { jobId?: string; verbose?: boolean } = {},
): Promise<RunResult> {
  const plan = await prisma.tripPlan.findUniqueOrThrow({ where: { id: planId } });
  const tripDays =
    Math.round((plan.endDate.getTime() - plan.startDate.getTime()) / 86_400_000) + 1;

  let prompt = planPrompt({
    destination: plan.destination,
    startDate: plan.startDate.toISOString().slice(0, 10),
    endDate: plan.endDate.toISOString().slice(0, 10),
    tripDays,
  });

  for (let attempt = 1; attempt <= 2; attempt++) {
    const r = await runAgent({
      planId,
      prompt,
      kind: 'generate_plan',
      jobId: opts.jobId,
      verbose: opts.verbose,
    });

    // Post-run assertion: trust the database, not the agent's summary.
    const days = await prisma.dayPlan.count({ where: { planId } });
    const slots = await prisma.itinerarySlot.count({ where: { day: { planId } } });

    if (days > 0 && slots > 0) {
      return { planId, ...r };
    }

    prompt +=
      `\n\nIMPORTANT: your previous attempt ended WITHOUT a successful save_itinerary call, ` +
      `so no plan exists. Complete every step and call save_itinerary with the full plan.`;
  }

  throw new Error(`Plan run failed for ${planId}: nothing saved after 2 attempts`);
}

export interface ReplanResult extends RunResult {
  /** False when the agent judged that nothing needed changing — a valid outcome. */
  changed: boolean;
  eventId: string | null;
  diffSummary: string | null;
}

/**
 * Re-plan an existing itinerary (P0.8).
 *
 * Unlike runPlan, a no-op is a legitimate result: if the trigger turns out not
 * to invalidate anything, the honest answer is to leave the plan alone. So the
 * post-run assertion checks whether a ReplanEvent appeared, and treats its
 * absence as "no change needed" rather than failure.
 */
export async function runReplan(
  planId: string,
  trigger: ReplanTrigger,
  opts: { detail?: string; jobId?: string; verbose?: boolean } = {},
): Promise<ReplanResult> {
  const plan = await prisma.tripPlan.findUniqueOrThrow({ where: { id: planId } });

  const dayCount = await prisma.dayPlan.count({ where: { planId } });
  if (dayCount === 0) {
    throw new Error(`Cannot re-plan ${planId}: no itinerary exists yet.`);
  }

  const before = await prisma.replanEvent.count({ where: { planId } });

  const prompt = replanPrompt({
    destination: plan.destination,
    trigger,
    detail: opts.detail,
  });

  const r = await runAgent({
    planId,
    prompt,
    kind: 'replan',
    jobId: opts.jobId,
    verbose: opts.verbose,
  });

  const event = await prisma.replanEvent.findFirst({
    where: { planId },
    orderBy: { triggeredAt: 'desc' },
  });

  const after = await prisma.replanEvent.count({ where: { planId } });
  const changed = after > before;

  return {
    planId,
    ...r,
    changed,
    eventId: changed ? (event?.id ?? null) : null,
    diffSummary: changed ? (event?.diffSummary ?? null) : null,
  };
}
