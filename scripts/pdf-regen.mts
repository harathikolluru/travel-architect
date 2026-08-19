import 'dotenv/config';
import { chromium } from 'playwright-core';
import { createHmac } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const planId = 'cmsz6ecix0001uiildiu5bdam';
const expires = Date.now() + 120000;
const sig = createHmac('sha256', process.env.AUTH_SECRET!).update(`${planId}.${expires}`).digest('hex');
const url = `http://localhost:3001/plan/${planId}/print?printToken=${encodeURIComponent(`${expires}.${sig}`)}`;

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
const pdf = await page.pdf({ format: 'A4', printBackground: true,
  margin: { top: '16mm', right: '14mm', bottom: '16mm', left: '14mm' } });
writeFileSync('/tmp/verify.pdf', pdf);
console.log('bytes:', pdf.length);
await browser.close();
