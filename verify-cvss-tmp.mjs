import { chromium } from '@playwright/test';
import fs from 'fs';

const shotDir = 'C:\\Users\\Utkarsh\\AppData\\Local\\Temp\\claude\\C--Users-Utkarsh\\550d23e9-bf5c-4cfa-bef3-96fa305c778d\\scratchpad\\shots';
fs.mkdirSync(shotDir, { recursive: true });

const ORG = '0ad9198d-d54b-4a46-8251-dd796b9d74bf';
const PROGRAM = '507506a3-15d7-4ed9-958b-1be8205562a5';
const REPORT_HIGH = 'fb4fd1c7-bfdc-4a69-9c11-607f03357dab'; // triaging
const REPORT_LOW = 'd525f92b-2d27-420c-a6a2-89ffa1f6a6ed'; // needs_information
const REPORT_CONTROL = 'ab01c39a-27cc-4833-97e0-f7f48172bfc9'; // new

function reportUrl(id) {
  return `http://localhost:3000/organizations/${ORG}/programs/${PROGRAM}/reports/${id}`;
}

const browser = await chromium.launch({ headless: true, channel: 'chromium', timeout: 60000 });
const page = await browser.newPage();
const consoleErrors = [];
page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
page.on('pageerror', err => consoleErrors.push('pageerror: ' + err.message));

async function shot(name) {
  await page.screenshot({ path: `${shotDir}\\${name}.png`, fullPage: true });
}

const results = {};

try {
  // ---- Login ----
  await page.goto('http://localhost:3000/sign-in', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await shot('00-login-page');
  const emailInput = page.locator('input[type="email"], input[name="email"]').first();
  const passInput = page.locator('input[type="password"], input[name="password"]').first();
  await emailInput.fill('demo.org.northwind@sentinel.demo');
  await passInput.fill('SentinelDemo!2026');
  await page.locator('button[type="submit"]').first().click();
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await shot('01-after-login');
  console.log('POST-LOGIN URL:', page.url());

  // ---- STEP A: HIGH severity CVSS combo ----
  await page.goto(reportUrl(REPORT_HIGH), { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1000);
  await shot('02-report-high-loaded');

  const attachLink = page.getByRole('button', { name: /Attach a CVSS score/i });
  await attachLink.waitFor({ state: 'visible', timeout: 10000 });
  await attachLink.click();
  await page.waitForTimeout(300);
  await shot('03-cvss-form-open');

  const selects = page.locator('select');
  const selectCount = await selects.count();
  console.log('TOTAL SELECT COUNT (incl severity):', selectCount);

  async function setCvssField(labelText, optionLabel) {
    const label = page.locator('label', { hasText: labelText }).first();
    const select = label.locator('select');
    await select.selectOption({ label: optionLabel });
  }

  await setCvssField('Attack vector', 'Network');
  await setCvssField('Attack complexity', 'Low');
  await setCvssField('Privileges required', 'None');
  await setCvssField('User interaction', 'None');
  await setCvssField('Scope', 'Unchanged');
  await setCvssField('Confidentiality impact', 'High');
  await setCvssField('Integrity impact', 'High');
  await setCvssField('Availability impact', 'High');
  await shot('04-cvss-high-filled');

  const severitySelect = page.getByLabel('Confirmed severity');
  await severitySelect.selectOption({ label: 'Critical' });
  await page.waitForTimeout(2000);
  await shot('05-after-severity-critical-save');
  results.stepA_consoleErrorsSoFar = [...consoleErrors];

  // ---- STEP B: LOW severity CVSS combo on different report ----
  await page.goto(reportUrl(REPORT_LOW), { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1000);
  await shot('06-report-low-loaded');

  const attachLink2 = page.getByRole('button', { name: /Attach a CVSS score/i });
  await attachLink2.waitFor({ state: 'visible', timeout: 10000 });
  await attachLink2.click();
  await page.waitForTimeout(300);

  await setCvssField('Attack vector', 'Physical');
  await setCvssField('Attack complexity', 'High');
  await setCvssField('Privileges required', 'High');
  await setCvssField('User interaction', 'Required');
  await setCvssField('Scope', 'Unchanged');
  await setCvssField('Confidentiality impact', 'Low');
  await setCvssField('Integrity impact', 'None');
  await setCvssField('Availability impact', 'None');
  await shot('07-cvss-low-filled');

  const severitySelect2 = page.getByLabel('Confirmed severity');
  await severitySelect2.selectOption({ label: 'Low' });
  await page.waitForTimeout(2000);
  await shot('08-after-severity-low-save');

  // ---- STEP C: control - no CVSS, direct severity set ----
  await page.goto(reportUrl(REPORT_CONTROL), { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1000);
  await shot('09-report-control-loaded');

  const severitySelect3 = page.getByLabel('Confirmed severity');
  await severitySelect3.selectOption({ label: 'Medium' });
  await page.waitForTimeout(2000);
  await shot('10-after-control-save');

  console.log('ALL CONSOLE ERRORS:', JSON.stringify(consoleErrors, null, 2));
  console.log('DONE');
} catch (e) {
  console.log('SCRIPT ERROR:', e.message);
  await shot('99-error-state');
} finally {
  await browser.close();
}
