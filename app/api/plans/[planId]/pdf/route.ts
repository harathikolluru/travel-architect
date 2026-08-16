// One-click PDF (P0.9).
//
// Renders the existing /plan/[id]/print page in headless Chromium and streams
// the result back as a file. Reusing that page means the PDF and the web view
// are the same document — there is no second layout to keep in sync.

import { NextResponse } from 'next/server';
import { prisma } from '@travel-architect/db';
import { auth, authEnabled } from '@/app/auth';
import { createPrintToken } from '@/app/lib/print-token';

export const runtime = 'nodejs';
export const maxDuration = 120;

function safeFilename(destination: string, start: Date): string {
  const slug = destination
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${slug}-${start.toISOString().slice(0, 10)}.pdf`;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ planId: string }> },
) {
  const { planId } = await params;

  const plan = await prisma.tripPlan.findUnique({ where: { id: planId } });
  if (!plan) return NextResponse.json({ error: 'not found' }, { status: 404 });

  if (authEnabled()) {
    const session = await auth();
    if (!session?.user?.id || session.user.id !== plan.userId) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
  }

  const { chromium } = await import('playwright-core');

  // Behind the platform proxy the container only sees its own bind address, so
  // req.url yields https://0.0.0.0:3000 — a URL Chromium cannot load. Prefer
  // the forwarded headers, then AUTH_URL, and fall back to req.url locally.
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  const proto = req.headers.get('x-forwarded-proto') ?? 'https';
  const origin = host
    ? `${proto}://${host}`
    : (process.env.AUTH_URL ?? new URL(req.url).origin);
  const token = createPrintToken(planId);
  const target = `${origin}/plan/${planId}/print?printToken=${encodeURIComponent(token)}`;

  let browser;
  try {
    browser = await chromium.launch({
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage();
    await page.goto(target, { waitUntil: 'networkidle', timeout: 60_000 });

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '16mm', right: '14mm', bottom: '16mm', left: '14mm' },
    });

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${safeFilename(plan.destination, plan.startDate)}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: `Could not generate the PDF: ${(e as Error).message}` },
      { status: 500 },
    );
  } finally {
    await browser?.close();
  }
}
