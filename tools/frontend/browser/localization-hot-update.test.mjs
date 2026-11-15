import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { assertLocalizedDocument, localizedBrowser, messages, ssrState } from './localization-fixture.mjs';

export function registerLocalizationHotUpdateScenario(environment) {
  // Run this source-watcher probe separately, coordinated with the main workflow.
  // Normal mode-parity tests never modify source timestamps.
  if (process.env.LOCALIZATION_HOT_UPDATE !== '1') return;
  test('Given opposite Vite browser locales, When the language selector timestamp triggers a hot update, Then regenerated SSR and hydrated locales remain isolated', { timeout: 30000 }, async t => {
    // Given hydrated English and Norwegian visitors and an observed Vite update boundary.
    assert.equal(process.env.BROWSER_FRONTEND_MODE, 'development');
    const state = environment();
    const readers = await Promise.all(['en', 'nb'].map(languageCookie => localizedBrowser(state, t, { languageCookie })));
    for (const [index, locale] of ['en', 'nb'].entries()) {
      const response = await readers[index].page.goto(state.frontendUrl, { waitUntil: 'networkidle' });
      await assertLocalizedDocument(readers[index].page, response, locale, messages[locale].landing_heading);
    }
    let updated;
    const update = new Promise(resolve => { updated = resolve; });
    let navigated;
    const navigation = new Promise(resolve => { navigated = resolve; });
    readers[0].page.on('framenavigated', frame => {
      if (frame === readers[0].page.mainFrame()) navigated();
    });
    await readers[0].page.exposeBinding('__reportLocaleHotUpdate', (_, type) => updated(type));
    await readers[0].page.evaluate(async () => {
      const { createHotContext } = await import('/@vite/client');
      const hot = createHotContext('/browser-localization-probe');
      hot.on('vite:afterUpdate', () => { void window.__reportLocaleHotUpdate('update'); });
      hot.on('vite:beforeFullReload', () => { void window.__reportLocaleHotUpdate('reload'); });
    });
    const component = new URL('../../../src/frontend/src/components/language-selector.tsx', import.meta.url);
    const original = fs.statSync(component);

    // When the authored React component triggers real Vite HMR without a content change.
    try {
      fs.utimesSync(component, original.atime, new Date());
      const type = await withinDeadline(update, 'Vite language selector update');
      if (type === 'reload') await withinDeadline(navigation, 'Vite full reload');

      // Then current browser output and overlapping fresh SSR still agree with each cookie.
      const responses = await Promise.all(readers.map(reader => reader.context.request.get(state.frontendUrl)));
      for (const [index, locale] of ['en', 'nb'].entries()) {
        assert.deepEqual(ssrState(await responses[index].text()), { locale, heading: messages[locale].landing_heading });
        assert.equal(await readers[index].page.locator('html').getAttribute('lang'), locale);
        assert.equal(await readers[index].page.locator('h1').textContent(), messages[locale].landing_heading);
        assert.equal((await readers[index].context.cookies()).find(cookie => cookie.name === 'PARAGLIDE_LOCALE')?.value, locale);
      }
    } finally {
      fs.utimesSync(component, original.atime, original.mtime);
    }
  });
}

async function withinDeadline(operation, label) {
  let timer;
  try {
    return await Promise.race([operation, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Timed out waiting for ${label}.`)), 10000);
    })]);
  } finally { clearTimeout(timer); }
}
