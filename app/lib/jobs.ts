import { prisma } from '@travel-architect/db';

/**
 * Agent jobs are marked RUNNING in-process, so a server restart or crash
 * strands the row and blocks every future run for that plan. Anything older
 * than the longest plausible run is dead, not running.
 */
const STALE_AFTER_MS = 15 * 60 * 1000;

/** Marks abandoned jobs failed and returns the one genuinely still in flight. */
export async function reapStaleJobs(planId: string) {
  const cutoff = new Date(Date.now() - STALE_AFTER_MS);

  await prisma.agentJob.updateMany({
    where: { planId, status: { in: ['QUEUED', 'RUNNING'] }, createdAt: { lt: cutoff } },
    data: { status: 'FAILED', error: 'Abandoned — the process ended before the run finished.' },
  });

  return prisma.agentJob.findFirst({
    where: { planId, status: { in: ['QUEUED', 'RUNNING'] } },
    orderBy: { createdAt: 'desc' },
  });
}
