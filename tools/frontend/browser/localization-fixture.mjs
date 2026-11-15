import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { capturePageErrors } from './page-errors.mjs';

export const messages = Object.fromEntries(['nb', 'en'].map(locale => [
  locale, JSON.parse(fs.readFileSync(new URL(`../../../src/frontend/messages/${locale}.json`, import.meta.url), 'utf8')),
]));

export async function localizedBrowser(state, t, { languageCookie, ...options } = {}) {
  const context = await state.context.browser().newContext(options);
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  capturePageErrors(page, errors);
  t.after(async () => {
    try { assert.deepEqual(errors, [], 'No page or hydration errors'); }
    finally { await context.close(); }
  });
  if (languageCookie !== undefined) {
    await context.addCookies([{ name: 'PARAGLIDE_LOCALE', value: languageCookie, url: state.frontendUrl }]);
  }
  return { ...state, context, page };
}

export async function selectLanguage(page, locale) {
  const address = new URL(page.url());
  address.hash = '';
  const [response] = await Promise.all([
    page.waitForResponse(candidate => candidate.request().isNavigationRequest()
      && candidate.request().frame() === page.mainFrame()
      && candidate.url() === address.href),
    page.getByRole('combobox').selectOption(locale),
  ]);
  await response.finished();
  await page.waitForLoadState('networkidle');
  return response;
}

export function ssrState(html) {
  return {
    locale: /<html\b[^>]*\blang="([^"]+)"/u.exec(html)?.[1],
    heading: /<h1\b[^>]*>([\s\S]*?)<\/h1>/u.exec(html)?.[1]
      .replace(/<[^>]*>/gu, '').replace(/\s+/gu, ' ').trim(),
  };
}

export async function assertLocalizedDocument(page, response, locale, heading) {
  const html = await response.text();
  assert.deepEqual(ssrState(html), { locale, heading });
  assert.equal(await page.locator('html').getAttribute('lang'), locale);
  assert.equal(await page.locator('h1').textContent(), heading);
  return html;
}

export function saveLocaleEvidence(reports, name, evidence, html) {
  const directory = path.resolve(reports, '../../plan00026', process.env.BROWSER_FRONTEND_MODE || 'production');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, `${name}.json`), JSON.stringify(evidence, null, 2) + '\n');
  fs.writeFileSync(path.join(directory, `${name}.html`), html);
}
