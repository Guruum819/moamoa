import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const out = '/opt/cursor/artifacts';
mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome-stable',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--lang=ko-KR'],
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text());
});

async function clickText(text, exact = false) {
  const ok = await page.evaluate((label, mustExact) => {
    const nodes = [...document.querySelectorAll('button, a')];
    const node = nodes.find((item) => {
      const value = (item.textContent || '').replace(/\s+/g, ' ').trim();
      return mustExact ? value === label : value.includes(label);
    });
    if (!node) return false;
    node.click();
    return true;
  }, text, exact);
  if (!ok) throw new Error(`missing button: ${text}`);
  await new Promise((resolve) => setTimeout(resolve, 250));
}

async function clickPrimary() {
  const label = await page.evaluate(() => {
    const button = document.querySelector('.sheet-foot .btn.primary');
    if (!button || button.disabled) return '';
    button.click();
    return button.textContent || '';
  });
  if (!label) throw new Error('primary disabled or missing');
  await new Promise((resolve) => setTimeout(resolve, 250));
  return label.replace(/\s+/g, ' ').trim();
}

async function shot(name) {
  await page.screenshot({ path: `${out}/${name}.png` });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 1) errors.push(`${name} overflow ${overflow}`);
}

await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.goto('http://127.0.0.1:4173/moamoa/', { waitUntil: 'networkidle0' });
await shot('01-home-empty');

await clickText('근무 추가');
await page.waitForSelector('input[placeholder="예: 메가커피 역삼점"]');
await page.type('input[placeholder="예: 메가커피 역삼점"]', '행사알바');
await clickText('일일알바');
await clickText('3.3%', true);
await shot('02-new-place');
const stepped = await clickPrimary();
if (!stepped.includes('다음')) errors.push('step button ' + stepped);
await page.waitForSelector('button[aria-label^="2026-11-"]', { timeout: 5000 });
await shot('03-date-step');
await page.click('button[aria-label^="2026-11-23"]');
await clickPrimary();
const payText = await page.evaluate(() => document.body.innerText);
if (!payText.includes('96,700원')) errors.push('missing 96700');
await shot('04-pay-step');
const saved = await clickPrimary();
if (!saved.includes('96,700')) errors.push('submit was ' + saved);
await page.waitForFunction(() => document.body.innerText.includes('11월 장부'));
await new Promise((resolve) => setTimeout(resolve, 2800));

await clickText('근무지');
await clickText('근무지 추가');
await page.waitForSelector('input[placeholder="예: 메가커피 역삼점"]');
const name = await page.$('input[placeholder="예: 메가커피 역삼점"]');
await name.click({ clickCount: 3 });
await name.type('우리카드');
await clickText('저장');
await page.waitForFunction(() => document.body.innerText.includes('우리카드'));
await shot('06-places');

await clickText('홈');
await page.waitForFunction(() => document.body.innerText.includes('우리카드') && document.body.innerText.includes('주휴수당'));
await shot('07-home-filled');
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await shot('07b-home-bottom');
await clickText('달력');
await page.waitForFunction(() => document.body.innerText.includes('이번 달 근무'));
await shot('08-calendar');
await page.click('button[aria-label^="2026-11-23"]');
await shot('09-calendar-day');
await clickText('정산');
await page.waitForFunction(() => document.body.innerText.includes('이번 달에 번 돈'));
await shot('10-settle');
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await shot('10b-settle-bottom');
await clickText('홈');
await page.click('button[aria-label="설정"]');
await page.waitForSelector('text/아이폰 캘린더'.replace('text/', '') ? 'h3' : 'h3');
await shot('11-settings');

await page.reload({ waitUntil: 'networkidle0' });
const kept = await page.evaluate(() => {
  const raw = localStorage.getItem('moamoa.v1');
  const data = JSON.parse(raw);
  return {
    places: data.workplaces.map((wp) => wp.name),
    shifts: data.shifts.length,
    hasToken: Boolean(data.settings.githubToken),
  };
});
if (!kept.places.includes('행사알바') || !kept.places.includes('우리카드')) errors.push('reload lost places ' + JSON.stringify(kept));
if (kept.shifts < 2) errors.push('too few shifts ' + kept.shifts);
await shot('12-after-reload');

await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await shot('13-width-375');
await page.setViewport({ width: 430, height: 932, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await clickText('달력');
await shot('14-width-430');

console.log(JSON.stringify({ kept, errors }, null, 2));
await browser.close();
if (errors.length) process.exit(1);
