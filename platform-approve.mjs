import { chromium } from 'playwright';

const SCRATCH = 'C:\\Users\\Utkarsh\\AppData\\Local\\Temp\\claude\\c--Users-Utkarsh-Documents-Codex-2026-08-25-files-pasted-by-the-user-master\\c825bae7-d93d-46b4-bd4d-d4d7451c2ce1\\scratchpad';
const STATE = `${SCRATCH}\\admin-storage-state.json`;

const browser = await chromium.launch();
const context = await browser.newContext({ storageState: STATE });
const page = await context.newPage();

page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
page.on('dialog', async d => { console.log('DIALOG:', d.message()); await d.accept(); });

console.log('Navigating to /platform/programs...');
await page.goto('http://localhost:3000/platform/programs', { waitUntil: 'networkidle' });

// Find the li containing "Acme Web Application Bounty"
const targetLi = page.locator('li', { hasText: 'Acme Web Application Bounty' });
console.log('Target li count:', await targetLi.count());
console.log('Target li text:', await targetLi.innerText());

const approveBtn = targetLi.getByRole('button', { name: 'Approve' });
console.log('Approve button count:', await approveBtn.count());

console.log('Clicking Approve...');
await approveBtn.click();
await page.waitForTimeout(2500);

console.log('URL after click:', page.url());
await page.screenshot({ path: `${SCRATCH}\\admin-03-after-approve-click.png`, fullPage: true });
console.log('Body after click snippet:', (await page.textContent('body')).slice(0, 800));

// Reload to double check
console.log('Reloading...');
await page.goto('http://localhost:3000/platform/programs', { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);

const remainingAcme = await page.locator('li', { hasText: 'Acme Web Application Bounty' }).count();
console.log('Remaining Acme entries in queue:', remainingAcme);

await page.screenshot({ path: `${SCRATCH}\\admin-04-queue-after-reload.png`, fullPage: true });
console.log('Full body after reload:', await page.textContent('body').then(t => t.slice(0, 1500)));

await browser.close();
