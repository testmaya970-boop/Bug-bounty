import { chromium } from 'playwright';
import fs from 'fs';

const SCRATCH = 'C:\\Users\\Utkarsh\\AppData\\Local\\Temp\\claude\\c--Users-Utkarsh-Documents-Codex-2026-08-25-files-pasted-by-the-user-master\\c825bae7-d93d-46b4-bd4d-d4d7451c2ce1\\scratchpad';
const EMAIL = 'acme-security-test@example.com';
const PASSWORD = 'AcmeSecurityTest2026!';
const ORG_ID = 'd99de194-87e0-46d2-937f-eff8d363161b';
const PROGRAM_ID = '5dc9c04f-9040-44c6-82b2-70dabc0b93d7';

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('response', res => { if (res.status() >= 400) console.log('HTTP_ERROR', res.status(), res.url()); });
const results = { orgId: ORG_ID, programId: PROGRAM_ID };

async function shot(name) {
  await page.screenshot({ path: `${SCRATCH}\\${name}.png`, fullPage: true });
}

try {
  await page.goto('http://localhost:3000/sign-in', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input', { timeout: 15000 });
  const inputs = await page.$$('input');
  await inputs[0].fill(EMAIL);
  await inputs[1].fill(PASSWORD);
  await page.click('button:has-text("Sign in")');
  await page.waitForTimeout(2000);

  if (!/organizations\/[a-f0-9-]{36}/i.test(page.url())) {
    if (!/\/organizations$/.test(page.url())) {
      await page.click('a:has-text("Organizations")');
      await page.waitForTimeout(1000);
    }
    await page.locator('a', { hasText: 'Acme Security Corp' }).first().click();
    await page.waitForTimeout(1200);
  }
  await page.click('main a:text-is("Programs")');
  await page.waitForTimeout(1200);
  await page.locator(`a[href*="/programs/"][href*="${ORG_ID}"]`).first().click();
  await page.waitForTimeout(1500);
  console.log('PROGRAM_URL', page.url());

  // ---- STEP 1: Add scope ----
  await page.click('button:has-text("Add scope")');
  await page.waitForTimeout(1000);
  await shot('B1-add-scope-dialog');

  const dialog = page.locator('div[role="presentation"]').last();
  await dialog.locator('select').first().selectOption({ label: 'URL' });
  await page.waitForTimeout(300);
  await dialog.locator('input[placeholder*="example.com"], input').first().fill('https://app.acme-test.example.com');
  await shot('B2-scope-filled');
  await dialog.locator('button:has-text("Add scope entry")').click();
  await page.waitForTimeout(1500);
  await shot('B3-scope-added');
  console.log('SCOPE_ADDED');

  // ---- STEP 2: Configure bounty policy ----
  await page.click('button:has-text("Configure bounty policy")');
  await page.waitForTimeout(1000);
  await shot('B4-bounty-policy-dialog');
  const policyDialog = page.locator('div[role="presentation"]').last();
  const policyDialogText = await policyDialog.innerText().catch(() => '');
  console.log('POLICY_DIALOG_TEXT', policyDialogText);

  fs.writeFileSync(`${SCRATCH}\\A-partial-results3.json`, JSON.stringify(results, null, 2));
} catch (e) {
  console.error('ERROR', e.message);
  await shot('B-error');
  console.log('CURRENT_URL', page.url());
} finally {
  await page.context().storageState({ path: `${SCRATCH}\\org-storage-state.json` });
  await browser.close();
}
