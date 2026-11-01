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
    assert.equal(await page.getByRole('link', { name: 'Logg inn' }).getAttribute('href'), '/login');
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
      assert.equal(await page.getByRole('link', { name: login }).getAttribute('href'), '/login');
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


  for (const route of ['/create-calendar', '/calendars/00000000-0000-4000-8000-000000000001', '/calendar-preview/00000000-0000-4000-8000-000000000001']) {
    test('Given an anonymous visitor, When protected route ' + route + ' loads, Then login replaces calendar content without protected hydration', async () => {
      // Given no authentication cookies and a protected calendar route.
      const { page, frontendUrl } = fixture;

      // When the route is opened directly and refreshed.
      const response = await page.goto(frontendUrl + route, { waitUntil: 'networkidle' });
      await page.reload({ waitUntil: 'networkidle' });

      // Then no calendar title, door content or creation form is exposed.
      assert.equal(new URL(page.url()).pathname, '/login');
      assert.match(response.headers()['cache-control'], /no-store/);
      assert.equal(await page.locator('ol button, #calendar-title, #door-text').count(), 0);
    });
  }

  test('Given an anonymous client, When legacy API and owner BFF paths are called, Then each returns protected denial', async () => {
    // Given no session on the direct API or BFF.
    const { apiUrl, frontendUrl } = fixture;
    const id = '00000000-0000-4000-8000-000000000001';

    // When legacy creation/read and privileged preview are attempted.
    const responses = await Promise.all([
      fetch(apiUrl + '/calendars', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Denied' }) }),
      fetch(apiUrl + '/calendars/' + id),
      fetch(frontendUrl + '/api/trpc/calendar.preview?input=' + encodeURIComponent(JSON.stringify({ id })))
    ]);

    // Then the previous anonymous bypass is closed, including error caching.
    for (const response of responses) {
      assert.equal(response.status, 401);
      assert.match(response.headers.get('cache-control'), /no-store/);
    }
  });

  test('Given a mobile anonymous visitor, When a protected preview loads, Then the login page fits without door content', async () => {
    // Given a narrow mobile viewport and no session.
    const { page, frontendUrl } = fixture;
    await page.setViewportSize({ width: 375, height: 812 });

    // When direct preview navigation is attempted.
    await page.goto(frontendUrl + '/calendar-preview/00000000-0000-4000-8000-000000000001', { waitUntil: 'networkidle' });

    // Then login is accessible without horizontal overflow or protected controls.
    assert.equal(new URL(page.url()).pathname, '/login');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.equal(await page.locator('ol button').count(), 0);
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
