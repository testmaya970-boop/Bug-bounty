import { chromium } from '@playwright/test';
import fs from 'fs';

const shotDir = 'C:\\Users\\Utkarsh\\AppData\\Local\\Temp\\claude\\C--Users-Utkarsh\\550d23e9-bf5c-4cfa-bef3-96fa305c778d\\scratchpad\\shots';
fs.mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();
const consoleErrors = [];
page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
page.on('pageerror', err => consoleErrors.push('pageerror: ' + err.message));

async function shot(name) {
  await page.screenshot({ path: `${shotDir}\\${name}.png`, fullPage: true });
}

try {
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await shot('00-landing');

  // Try to find login form
  const bodyText = await page.textContent('body');
  console.log('LANDING PAGE TEXT SNIPPET:', bodyText.slice(0, 300));

  // Look for email/password inputs
  const emailInput = page.locator('input[type="email"], input[name="email"]').first();
  const passInput = page.locator('input[type="password"], input[name="password"]').first();

  if (await emailInput.count() > 0) {
    await emailInput.fill('demo.researcher@sentinel.demo');
    await passInput.fill('SentinelDemo!2026');
    await shot('01-login-filled');
    const submitBtn = page.locator('button[type="submit"]').first();
    await submitBtn.click();
    await page.waitForTimeout(2000);
    await shot('02-after-login');
  } else {
    console.log('No login inputs found on landing page, current URL:', page.url());
  }

  console.log('CURRENT URL after login attempt:', page.url());
  console.log('CONSOLE ERRORS SO FAR:', JSON.stringify(consoleErrors));

} catch (e) {
  console.log('ERROR:', e.message);
} finally {
  await browser.close();
}
