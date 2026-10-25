import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, afterEach, before, beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from '../../../src/frontend/node_modules/playwright/index.mjs';

const welcome = 'Velkommen til advent';
const introduction = 'Her kan du lage en adventskalender til en du er glad i eller åpne en kalender noen har laget for deg';

describe('Frontend browser smoke', { timeout: 120000 }, () => {
  const fixture = browserFixture();

  test('Given a new visitor, When the landing page is opened and refreshed, Then Norwegian content is server-rendered without calendar reads', async () => {
    // Given a new browser context with no selected language.
    const { page, frontendUrl, apiUrl, requests, reports } = fixture;

    // When the visitor opens and refreshes the landing page.
    const response = await page.goto(frontendUrl);
    const html = await response.text();
    await page.reload({ waitUntil: 'networkidle' });

    // Then / renders the exact copy and login navigation without fetching a calendar.
    assert.equal(response.status(), 200);
    assert(html.includes(welcome));
    assert(html.includes(introduction));
    assert.equal(new URL(page.url()).pathname, '/');
    assert.equal(await page.locator('h1').textContent(), welcome);
    assert.equal(await page.locator('main p').textContent(), introduction);
    assert.equal(await page.locator('html').getAttribute('lang'), 'nb');
    assert.equal(await page.getByRole('link', { name: 'Logg inn' }).getAttribute('href'), '/logg-inn');
    assert(!requests.some(url => url.includes('/api/trpc/') || url.startsWith(apiUrl)));
    await page.screenshot({ path: path.join(reports, 'landing-desktop.png'), fullPage: true });
  });

  test('Given the landing page, When English and Norwegian are selected and refreshed, Then translated content and login navigation survive SSR', async () => {
    // Given the default Norwegian landing page and both supported translations.
    const { page, frontendUrl } = fixture;
    await page.goto(frontendUrl);
    const languages = [
      ['en', 'Welcome to Advent', 'Here you can create an advent calendar for someone you love or open a calendar someone has made for you', 'Log in'],
      ['nb', welcome, introduction, 'Logg inn'],
    ];

    for (const [locale, heading, description, login] of languages) {
      // When each language is selected and refreshed.
      await selectLanguage(page, locale);
      await page.reload({ waitUntil: 'networkidle' });

      // Then the route, translations and login link remain consistent.
      assert.equal(await page.locator('html').getAttribute('lang'), locale);
      assert.equal(await page.locator('h1').textContent(), heading);
      assert.equal(await page.locator('main p').textContent(), description);
      assert.equal(await page.getByRole('link', { name: login }).getAttribute('href'), '/logg-inn');
      assert.equal(new URL(page.url()).pathname, '/');
    }
  });

  test('Given a mobile visitor, When the landing page loads, Then content fits with login at the top right and a visible language selector', async () => {
    // Given a narrow mobile viewport.
    const { page, frontendUrl, reports } = fixture;
    await page.setViewportSize({ width: 375, height: 812 });

    // When the landing page loads.
    await page.goto(frontendUrl, { waitUntil: 'networkidle' });
    const login = await page.getByRole('link', { name: 'Logg inn' }).boundingBox();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);

    // Then controls fit and login remains in the top-right corner.
    assert.equal(overflow, false);
    assert(login, 'Login is visible');
    assert(login.x > 375 / 2 && login.x + login.width <= 375);
    assert(login.y < 50);
    assert.equal(await page.getByRole('combobox').isVisible(), true);
    await page.screenshot({ path: path.join(reports, 'landing-mobile.png'), fullPage: true });
  });

  test('Given a persisted calendar, When its URL is opened directly, Then stored ordered doors hydrate without a duplicate read', async () => {
    // Given a calendar created by this suite and no selected language.
    const { page, frontendUrl, apiUrl, requests, reports } = fixture;
    const stored = await (await fetch(`${apiUrl}/calendars/${fixture.calendar.id}`)).json();

    // When the calendar is opened directly and hydrates.
    await page.goto(`${frontendUrl}/calendars/${fixture.calendar.id}`, { waitUntil: 'networkidle' });

    // Then stored data is rendered without browser reads or hydration errors.
    assert.equal(new URL(page.url()).pathname, `/calendars/${fixture.calendar.id}`);
    assert.equal(await page.locator('h1').textContent(), stored.title);
    assert.deepEqual(await page.locator('ol li').allTextContents(), stored.doors.map(door => String(door.number)));
    assert.equal(await page.locator('html').getAttribute('lang'), 'nb');
    assert(!requests.some(url => url.includes('/api/trpc/')));
    await page.screenshot({ path: path.join(reports, 'calendar-desktop.png'), fullPage: true });
  });

  test('Given a stored calendar title, When English is selected and refreshed, Then the interface changes while the title stays unchanged', async () => {
    // Given the Norwegian calendar and its original stored title.
    const { page, frontendUrl, apiUrl } = fixture;
    await page.goto(`${frontendUrl}/calendars/${fixture.calendar.id}`);
    const original = await page.locator('h1').textContent();

    // When the user selects English and refreshes.
    await selectLanguage(page, 'en');
    await page.reload({ waitUntil: 'networkidle' });
    const stored = await (await fetch(`${apiUrl}/calendars/${fixture.calendar.id}`)).json();

    // Then selected language survives SSR and the stored title is unchanged.
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    assert.equal(await page.getByRole('combobox').getAttribute('aria-label'), 'Language');
    assert.equal(await page.locator('h1').textContent(), original);
    assert.equal(stored.title, original);
  });

  test('Given two persisted calendars, When their URLs and a browser query are used, Then the BFF returns each stored calendar without door text', async () => {
    // Given distinct calendars created through the existing API.
    const { page, frontendUrl, apiUrl, requests, reports } = fixture;
    const calendars = [];
    for (const title of ['Smoke test: Ærlig jul 🎄', 'Smoke test: Another calendar']) {
      const response = await fetch(`${apiUrl}/calendars`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      assert.equal(response.status, 201);
      calendars.push(await response.json());
    }
    fs.writeFileSync(path.join(reports, 'calendars.json'), JSON.stringify(calendars, null, 2) + '\n');

    for (const calendar of calendars) {
      // When each stored calendar URL is loaded.
      await page.goto(`${frontendUrl}/calendars/${calendar.id}`, { waitUntil: 'networkidle' });

      // Then the correct stored title is displayed.
      assert.equal(await page.locator('h1').textContent(), calendar.title);
    }

    // When a browser read is made through tRPC.
    const read = await page.evaluate(async id => {
      const input = encodeURIComponent(JSON.stringify({ id }));
      const response = await fetch(`/api/trpc/calendar.get?input=${input}`);
      return { status: response.status, body: await response.json() };
    }, calendars[1].id);

    // Then the response omits door contents and the browser only calls the BFF.
    assert.equal(read.status, 200);
    assert.equal(read.body.result.data.title, calendars[1].title);
    assert(read.body.result.data.doors.every(door => !('text' in door)));
    assert(requests.some(url => url.includes('/api/trpc/calendar.get')));
    assert(!requests.some(url => url.startsWith(apiUrl)));
  });

  test('Given invalid and missing calendars, When English and Norwegian are selected, Then errors use translated interface text', async () => {
    // Given an English reader and malformed or unknown calendar IDs.
    const { page, frontendUrl } = fixture;
    await page.goto(frontendUrl);
    await selectLanguage(page, 'en');
    const cases = [
      ['bad-id', 'The calendar address is invalid.'],
      ['00000000-0000-4000-8000-000000000000', 'We could not find this calendar.'],
    ];

    for (const [id, message] of cases) {
      // When the invalid or missing calendar is requested.
      await page.goto(`${frontendUrl}/calendars/${id}`, { waitUntil: 'networkidle' });

      // Then a translated error describes the failure.
      assert.equal(await page.getByRole('alert').locator('p').textContent(), message);
    }

    // When the missing-calendar page is switched to Norwegian.
    await selectLanguage(page, 'nb');

    // Then the same error is translated without exposing backend prose.
    assert.equal(await page.getByRole('alert').locator('p').textContent(), 'Vi fant ikke denne kalenderen.');
  });

  test('Given a mobile calendar reader, When a persisted calendar loads, Then all 24 static doors fit without horizontal overflow', async () => {
    // Given a narrow mobile viewport.
    const { page, frontendUrl, reports } = fixture;
    await page.setViewportSize({ width: 375, height: 812 });

    // When the test calendar loads.
    await page.goto(`${frontendUrl}/calendars/${fixture.calendar.id}`, { waitUntil: 'networkidle' });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);

    // Then all doors fit without interactive door controls.
    assert.equal(await page.locator('ol li').count(), 24);
    assert.equal(await page.locator('ol button, ol a').count(), 0);
    assert.equal(overflow, false);
    await page.screenshot({ path: path.join(reports, 'calendar-mobile.png'), fullPage: true });
  });
});

// Each test gets a fresh browser context so locale cookies and requests cannot leak.
function browserFixture() {
  const fixture = {
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
    apiUrl: process.env.API_URL || 'http://localhost:8080',
    reports: fileURLToPath(new URL('../../../quality-reports/frontend/', import.meta.url)),
  };
  let browser;

  before(async () => {
    fs.mkdirSync(fixture.reports, { recursive: true });
    const response = await fetch(`${fixture.apiUrl}/calendars`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Browser test calendar' }),
    });
    assert.equal(response.status, 201);
    fixture.calendar = await response.json();
    browser = await chromium.launch({
      headless: true,
      channel: process.env.BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined),
    });
  });

  beforeEach(async () => {
    fixture.errors = [];
    fixture.requests = [];
    fixture.context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
    fixture.page = await fixture.context.newPage();
    fixture.page.setDefaultTimeout(10000);
    fixture.page.on('pageerror', error => fixture.errors.push(error.message));
    fixture.page.on('console', message => {
      if (message.type() === 'error' && /hydration|did not match|Minified React error/i.test(message.text())) {
        fixture.errors.push(message.text());
      }
    });
    fixture.page.on('response', response => {
      if (response.status() >= 400 && /\.(js|css|jpg)$/.test(new URL(response.url()).pathname)) {
        fixture.errors.push(`Asset request failed: ${response.status()} ${response.url()}`);
      }
    });
    fixture.page.on('request', request => fixture.requests.push(request.url()));
  });

  afterEach(async () => {
    try {
      assert.deepEqual(fixture.errors, [], 'No page, hydration or asset errors');
    } finally {
      await fixture.context?.close();
    }
  });

  after(async () => {
    await browser?.close();
  });

  return fixture;
}

async function selectLanguage(page, locale) {
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle' }),
    page.getByRole('combobox').selectOption(locale),
  ]);
}
