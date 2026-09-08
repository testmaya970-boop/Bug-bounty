import { chromium } from 'playwright';
import fs from 'fs';

const SCRATCH = 'C:\\Users\\Utkarsh\\AppData\\Local\\Temp\\claude\\c--Users-Utkarsh-Documents-Codex-2026-08-25-files-pasted-by-the-user-master\\c825bae7-d93d-46b4-bd4d-d4d7451c2ce1\\scratchpad';
const EMAIL = 'acme-security-test@example.com';
const PASSWORD = 'AcmeSecurityTest2026!';
const ORG_ID = 'd99de194-87e0-46d2-937f-eff8d363161b';

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('response', res => { if (res.status() >= 400) console.log('HTTP_ERROR', res.status(), res.url()); });
const results = { orgId: ORG_ID };

try {
  // Sign in fresh (raw goto to sign-in is fine since it's a public page)
  await page.goto('http://localhost:3000/sign-in', { waitUntil: 'networkidle' });
  const inputs = await page.$$('input');
  await inputs[0].fill(EMAIL);
  await inputs[1].fill(PASSWORD);
  await page.click('button:has-text("Sign in")');
  await page.waitForTimeout(2000);
  console.log('SIGNED_IN_URL', page.url());

  // Click into org via UI (avoid direct goto to authenticated deep links)
  if (!/organizations\/[a-f0-9-]{36}/i.test(page.url())) {
    if (!/\/organizations$/.test(page.url())) {
      await page.click('a:has-text("Organizations")');
      await page.waitForTimeout(1000);
    }
    await page.locator('a', { hasText: 'Acme Security Corp' }).first().click();
    await page.waitForTimeout(1200);
  }
  console.log('ORG_HOME', page.url());

  await page.click('main a:text-is("Programs")');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SCRATCH}\\A8-programs-list.png`, fullPage: true });
  console.log('PROGRAMS_LIST_URL', page.url());

  // Click into the existing program (match by href pattern to avoid ambiguous text matches)
  await page.locator(`a[href*="/programs/"][href*="${ORG_ID}"]`).first().click();
  await page.waitForTimeout(1500);
  console.log('PROGRAM_URL', page.url());
  const progMatch = page.url().match(/programs\/([a-f0-9-]+)/i);
  results.programId = progMatch ? progMatch[1] : null;
  console.log('PROGRAM_ID', results.programId);
  await page.screenshot({ path: `${SCRATCH}\\A9-program-detail.png`, fullPage: true });

  // Dump page structure to find scope/policy/visibility tabs
  const bodyText = await page.locator('body').innerText();
  fs.writeFileSync(`${SCRATCH}\\A-program-detail-text.txt`, bodyText);
  console.log('PROGRAM_DETAIL_TEXT_SAVED');

  fs.writeFileSync(`${SCRATCH}\\A-partial-results2.json`, JSON.stringify(results, null, 2));
} catch (e) {
  console.error('ERROR', e.message);
  await page.screenshot({ path: `${SCRATCH}\\A2-error.png`, fullPage: true }).catch(()=>{});
  console.log('CURRENT_URL', page.url());
} finally {
  await page.context().storageState({ path: `${SCRATCH}\\org-storage-state.json` });
  await browser.close();
}
