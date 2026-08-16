import { chromium } from 'playwright-core';
import { createHmac } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import 'dotenv/config';

const planId = 'cmstu1ata00018oj6x4ni3hjm';
const expires = Date.now() + 120000;
const sig = createHmac('sha256', process.env.AUTH_SECRET!).update(`${planId}.${expires}`).digest('hex');
const token = `${expires}.${sig}`;
const url = `http://localhost:3001/plan/${planId}/print?printToken=${encodeURIComponent(token)}`;

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
console.log('page status:', res?.status());
const title = await page.locator('h1').first().textContent().catch(() => null);
console.log('h1:', title);
const pdf = await page.pdf({ format: 'A4', printBackground: true,
  margin: { top: '16mm', right: '14mm', bottom: '16mm', left: '14mm' } });
writeFileSync('/tmp/itinerary.pdf', pdf);
console.log('pdf bytes:', pdf.length);
await browser.close();
