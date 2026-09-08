import { chromium } from 'playwright';

const SCRATCH = 'C:\\Users\\Utkarsh\\AppData\\Local\\Temp\\claude\\c--Users-Utkarsh-Documents-Codex-2026-08-25-files-pasted-by-the-user-master\\c825bae7-d93d-46b4-bd4d-d4d7451c2ce1\\scratchpad';
const STATE = `${SCRATCH}\\admin-storage-state.json`;

const browser = await chromium.launch();
const context = await browser.newContext({ storageState: STATE });
const page = await context.newPage();

page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

console.log('Navigating to /platform/programs...');
const resp = await page.goto('http://localhost:3000/platform/programs', { waitUntil: 'networkidle' });
console.log('Status:', resp.status());
console.log('URL:', page.url());

await page.screenshot({ path: `${SCRATCH}\\admin-02-platform-programs.png`, fullPage: true });

console.log('--- BODY TEXT ---');
console.log(await page.textContent('body'));

await browser.close();
