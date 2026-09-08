import { chromium } from 'playwright';
import fs from 'fs';

const SCRATCH = 'C:\\Users\\Utkarsh\\AppData\\Local\\Temp\\claude\\c--Users-Utkarsh-Documents-Codex-2026-08-25-files-pasted-by-the-user-master\\c825bae7-d93d-46b4-bd4d-d4d7451c2ce1\\scratchpad';
const MAILPIT = 'http://127.0.0.1:54324';

const EMAIL = 'acme-security-test@example.com';
const PASSWORD = 'AcmeSecurityTest2026!';
const ORG_NAME = 'Acme Security Corp';

async function findConfirmLink(email, afterTs) {
  for (let i = 0; i < 30; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=to:${encodeURIComponent(email)}`);
    const data = await res.json();
    if (data.messages && data.messages.length > 0) {
      const msg = data.messages[0];
      const msgRes = await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`);
      const msgData = await msgRes.json();
      const body = msgData.HTML || msgData.Text || '';
      const match = body.match(/https?:\/\/[^\s"'<>\)]+/g);
      if (match) {
        const link = match.find(l => l.includes('verify') || l.includes('confirm') || l.includes('auth') || l.includes('token')) || match[0];
        return link;
      }
    }
    await new Promise(r => setTimeout(r, 1500));
  }
  throw new Error('No confirmation email found for ' + email);
}

const browser = await chromium.launch();
const page = await browser.newPage();
const results = {};

async function shot(name) {
  const p = `${SCRATCH}\\${name}.png`;
  await page.screenshot({ path: p, fullPage: true });
  return p;
}

const SKIP_SIGNUP = process.env.SKIP_SIGNUP === '1';

try {
  if (!SKIP_SIGNUP) {
    await page.goto('http://localhost:3000/organizations/sign-up', { waitUntil: 'networkidle' });
    const inputs = await page.$$('input');
    await inputs[0].fill(ORG_NAME);
    await inputs[1].fill(EMAIL);
    await inputs[2].fill(PASSWORD);
    await page.screenshot({ path: `${SCRATCH}\\A1-signup-filled.png`, fullPage: true });
    await page.click('button:has-text("Create account")');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${SCRATCH}\\A2-signup-submitted.png`, fullPage: true });
    console.log('POST_SIGNUP_URL', page.url());

    let link = await findConfirmLink(EMAIL);
    link = link.replace(/&amp;/g, '&');
    console.log('CONFIRM_LINK', link);
    await page.goto(link, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    console.log('POST_CONFIRM_URL', page.url());
    await page.screenshot({ path: `${SCRATCH}\\A3-org-confirmed.png`, fullPage: true });
    results.orgConfirmUrl = page.url();
  } else {
    await page.goto('http://localhost:3000/sign-in', { waitUntil: 'networkidle' });
    const inputs = await page.$$('input');
    await inputs[0].fill(EMAIL);
    await inputs[1].fill(PASSWORD);
    await page.click('button:has-text("Sign in")');
    await page.waitForTimeout(2500);
    console.log('POST_SIGNIN_URL', page.url());
    await page.screenshot({ path: `${SCRATCH}\\A3-org-confirmed.png`, fullPage: true });
    results.orgConfirmUrl = page.url();
  }

  // If we're not already inside the org (e.g. skip-signup sign-in path lands on /organizations list), click into it
  if (!/organizations\/[a-f0-9-]{36}/i.test(page.url())) {
    if (!/\/organizations$/.test(page.url())) {
      await page.goto('http://localhost:3000/organizations', { waitUntil: 'networkidle' });
      await page.waitForTimeout(1000);
    }
    const rowLink = page.locator('a', { hasText: 'Acme Security Corp' }).first();
    if (await rowLink.count() > 0) {
      await rowLink.click();
    } else {
      // fallback: click the nearest ancestor row
      await page.locator('text=Acme Security Corp').first().click();
    }
    await page.waitForTimeout(1500);
  }
  await page.screenshot({ path: `${SCRATCH}\\A3b-org-home.png`, fullPage: true });
  console.log('ORG_HOME_URL', page.url());

  // Extract org id from URL
  const orgMatch = page.url().match(/organizations\/([a-f0-9-]+)/i);
  results.orgId = orgMatch ? orgMatch[1] : null;
  console.log('ORG_ID', results.orgId);

  // Navigate to Programs via the org's own tab bar (not the global sidebar "Programs" link)
  await page.click('main a:text-is("Programs")');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SCRATCH}\\A4-programs-page.png`, fullPage: true });
  console.log('PROGRAMS_PAGE_URL', page.url());

  // find create program button
  const createBtn = await page.locator('a:has-text("New program"), button:has-text("New program"), a:has-text("Create program"), button:has-text("Create program")').first();
  if (await createBtn.count() > 0) {
    await createBtn.click();
  } else {
    console.log('NO_CREATE_BUTTON_FOUND - dumping body text');
    console.log(await page.locator('body').innerText());
  }
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SCRATCH}\\A5-create-program-form.png`, fullPage: true });
  console.log('CREATE_PROGRAM_URL', page.url());

  // Fill in Create program modal: name + type (Paid bounty is already default)
  await page.getByLabel('Program name').fill('Acme Web Application Bounty').catch(async () => {
    await page.locator('text=Program name').locator('xpath=following::input[1]').fill('Acme Web Application Bounty');
  });
  await page.screenshot({ path: `${SCRATCH}\\A6-program-name-filled.png`, fullPage: true });

  page.on('console', msg => console.log('BROWSER_CONSOLE', msg.type(), msg.text()));
  page.on('response', res => { if (res.status() >= 400) console.log('HTTP_ERROR', res.status(), res.url()); });
  await page.locator('div[role="presentation"] button:has-text("Create program")').click();
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${SCRATCH}\\A7-program-created.png`, fullPage: true });
  console.log('PROGRAM_URL', page.url());
  const progMatch = page.url().match(/programs\/([a-f0-9-]+)/i);
  results.programId = progMatch ? progMatch[1] : null;
  console.log('PROGRAM_ID', results.programId);

  fs.writeFileSync(`${SCRATCH}\\A-partial-results.json`, JSON.stringify(results, null, 2));
} catch (e) {
  console.error('ERROR', e.message);
  await page.screenshot({ path: `${SCRATCH}\\A-error.png`, fullPage: true }).catch(()=>{});
  console.log('CURRENT_URL', page.url());
  fs.writeFileSync(`${SCRATCH}\\A-partial-results.json`, JSON.stringify(results, null, 2));
} finally {
  await page.context().storageState({ path: `${SCRATCH}\\org-storage-state.json` });
  await browser.close();
}
