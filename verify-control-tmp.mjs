import { chromium } from '@playwright/test';
import fs from 'fs';

const shotDir = 'C:\\Users\\Utkarsh\\AppData\\Local\\Temp\\claude\\C--Users-Utkarsh\\550d23e9-bf5c-4cfa-bef3-96fa305c778d\\scratchpad\\shots';
fs.mkdirSync(shotDir, { recursive: true });

const ORG = '0ad9198d-d54b-4a46-8251-dd796b9d74bf';
const PROGRAM = '507506a3-15d7-4ed9-958b-1be8205562a5';
const REPORT_CONTROL = 'ab01c39a-27cc-4833-97e0-f7f48172bfc9'; // new

function reportUrl(id) {
  return `http://localhost:3000/organizations/${ORG}/programs/${PROGRAM}/reports/${id}`;
}

const browser = await chromium.launch({ headless: true, channel: 'chromium', timeout: 60000 });
const page = await browser.newPage();
const consoleErrors = [];
page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
page.on('pageerror', err => consoleErrors.push('pageerror: ' + err.message));
page.on('response', async (resp) => {
  if (resp.status() >= 400) {
    let body = '';
    try { body = (await resp.text()).slice(0, 1000); } catch {}
    console.log('HTTP ERROR', resp.status(), resp.url(), body);
  }
});
page.on('requestfailed', (req) => {
  console.log('REQUEST FAILED', req.url(), req.failure()?.errorText);
});

async function shot(name) {
  await page.screenshot({ path: `${shotDir}\\${name}.png`, fullPage: true });
}

try {
  await page.goto('http://localhost:3000/sign-in', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(500);
  await page.locator('input[type="email"]').first().fill('demo.org.northwind@sentinel.demo');
  await page.locator('input[type="password"]').first().fill('SentinelDemo!2026');
  await shot('10a-control-login-filled');
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(3000);
  await shot('10b-control-login-after-click');
  console.log('POST LOGIN URL:', page.url());
  const bodyText = await page.textContent('body');
  console.log('BODY SNIPPET:', bodyText.slice(0, 500));

  await page.goto(reportUrl(REPORT_CONTROL), { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1000);
  await shot('11-control-before-triage');

  // Now set severity directly, WITHOUT clicking "Attach a CVSS score"
  const severitySelect = page.getByLabel('Confirmed severity');
  await severitySelect.waitFor({ state: 'visible', timeout: 10000 });
  await severitySelect.selectOption({ label: 'Medium' });
  await page.waitForTimeout(2000);
  await shot('13-control-after-severity-set');

  console.log('FINAL URL:', page.url());
  console.log('CONSOLE ERRORS:', JSON.stringify(consoleErrors, null, 2));
  console.log('DONE');
} catch (e) {
  console.log('SCRIPT ERROR:', e.message);
  await shot('99-control-error');
} finally {
  await browser.close();
}
