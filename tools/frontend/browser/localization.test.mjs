import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertLocalizedDocument, localizedBrowser, messages, saveLocaleEvidence, selectLanguage, ssrState } from './localization-fixture.mjs';

export function registerLocalizationScenarios(environment) {
  test('Given a cold landing document, When English is selected immediately after load and refreshed, Then cookie request SSR and hydration keep the selection', async t => {
    // Given the historical smoke boundary, without an extra hydration wait.
    const state = environment();
    await state.page.goto(state.frontendUrl);

    // When English is selected immediately after the browser load event.
    const selected = await selectLanguage(state.page, 'en');
    const selectedHtml = await selected.text();
    const afterSelection = await publicEvidence(state, selected, selectedHtml);
    const refreshed = await state.page.reload({ waitUntil: 'networkidle' });
    const html = await refreshed.text();
    const afterRefresh = await publicEvidence(state, refreshed, html);
    saveLocaleEvidence(state.reports, 'cold-landing-selection', { afterSelection, afterRefresh }, html);
    t.diagnostic(JSON.stringify({ afterSelection, afterRefresh }));

    // Then the exact original failure cannot be hidden by a later readiness wait.
    assert.equal(afterSelection.selectedCookie, 'en');
    assert.equal(afterRefresh.requestCookie, 'PARAGLIDE_LOCALE=en');
    assert.deepEqual(afterSelection.server, { locale: 'en', heading: messages.en.landing_heading });
    await assertLocalizedDocument(state.page, refreshed, 'en', messages.en.landing_heading);
  });

  test('Given held client scripts, When language selection is attempted before hydration, Then the choice survives or the control waits until hydration', async t => {
    // Given actual SSR with client scripts delayed before React can attach handlers.
    const state = environment();
    let release;
    const held = new Promise(resolve => { release = resolve; });
    const deadline = setTimeout(() => release(), 10000);
    t.after(() => { clearTimeout(deadline); release(); });
    const reader = await localizedBrowser(state, t);
    await reader.page.route('**/*', async route => {
      if (route.request().resourceType() === 'script') await held;
      await route.continue().catch(() => {});
    });
    const scriptRequested = reader.page.waitForRequest(request => request.resourceType() === 'script');
    await reader.page.goto(state.frontendUrl, { waitUntil: 'commit' });
    await scriptRequested;
    const selector = reader.page.getByRole('combobox');
    await selector.waitFor();
    const disabledBeforeHydration = await selector.isDisabled();

    // When an enabled native selector is used before scripts are released.
    if (!disabledBeforeHydration) await selector.selectOption('en');
    const cookieBeforeHydration = (await reader.context.cookies()).find(cookie => cookie.name === 'PARAGLIDE_LOCALE')?.value ?? null;
    release();
    clearTimeout(deadline);
    await reader.page.waitForLoadState('networkidle');
    const cookieAfterHydration = (await reader.context.cookies()).find(cookie => cookie.name === 'PARAGLIDE_LOCALE')?.value;
    t.diagnostic(JSON.stringify({ disabledBeforeHydration, cookieBeforeHydration, cookieAfterHydration,
      selectedAfterHydration: await selector.inputValue(), documentLocale: await reader.page.locator('html').getAttribute('lang') }));
    if (disabledBeforeHydration) await selectLanguage(reader.page, 'en');

    // Then an offered choice is never silently replaced by Norwegian after hydration.
    assert.equal((await reader.context.cookies()).find(cookie => cookie.name === 'PARAGLIDE_LOCALE')?.value, 'en');
    assert.equal(await reader.page.locator('html').getAttribute('lang'), 'en');
    assert.equal(await reader.page.locator('h1').textContent(), messages.en.landing_heading);
  });

  test('Given the login confirmation route, When English then Norwegian are selected, Then cookie request SSR and hydrated messages agree without losing URL state', async t => {
    // Given a public route whose confirmation query must survive language selection.
    const state = environment();
    const { page, frontendUrl, reports } = state;
    const address = `${frontendUrl}/login?changed=1`;
    await page.goto(address, { waitUntil: 'networkidle' });

    for (const locale of ['en', 'nb']) {
      // When the real selector reloads the same document in each language.
      const response = await selectLanguage(page, locale);
      const html = await response.text();
      const evidence = { selected: locale, ...await publicEvidence(state, response, html) };
      saveLocaleEvidence(reports, `language-selection-${locale}`, evidence, html);
      t.diagnostic(JSON.stringify(evidence));

      // Then actual transport, raw SSR and hydrated UI share the selected locale.
      assert.equal(evidence.selectedCookie, locale);
      assert.equal(evidence.requestCookie, `PARAGLIDE_LOCALE=${locale}`);
      assert.equal(page.url(), address);
      await assertLocalizedDocument(page, response, locale, messages[locale].login_label);
      assert.equal(await page.getByRole('status').textContent(), messages[locale].password_changed);
      const refreshed = await page.reload({ waitUntil: 'networkidle' });
      await assertLocalizedDocument(page, refreshed, locale, messages[locale].login_label);
      const landing = await page.goto(frontendUrl, { waitUntil: 'networkidle' });
      await assertLocalizedDocument(page, landing, locale, messages[locale].landing_heading);
      await page.getByRole('link', { name: messages[locale].login_label, exact: true }).click();
      await page.waitForURL(`${frontendUrl}/login`);
      await page.goto(address, { waitUntil: 'networkidle' });
    }
  });

  for (const languageCookie of [undefined, 'unsupported-locale']) {
    test(`Given English browser preferences and ${languageCookie ? 'an invalid' : 'no'} locale cookie, When the initial document hydrates and reloads, Then Norwegian remains the default`, async t => {
      // Given a real English browser preference that must not replace the base locale.
      const state = environment();
      const reader = await localizedBrowser(state, t, {
        languageCookie, locale: 'en-US', extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
      });

      // When the untouched visitor opens and reloads the public route.
      const initial = await reader.page.goto(state.frontendUrl, { waitUntil: 'networkidle' });
      const initialHtml = await initial.text();
      const refreshed = await reader.page.reload({ waitUntil: 'networkidle' });

      // Then raw SSR and hydrated content agree on Norwegian despite English preferences.
      assert.match(await initial.request().headerValue('accept-language'), /^en/u);
      assert.deepEqual(ssrState(initialHtml), { locale: 'nb', heading: messages.nb.landing_heading });
      await assertLocalizedDocument(reader.page, refreshed, 'nb', messages.nb.landing_heading);
    });
  }

  test('Given concurrent visitors with opposite locale cookies, When SSR hydration and language selection overlap, Then each request and browser keeps its own selected language', async t => {
    // Given independent browser cookies, pages and server requests.
    const state = environment();
    const readers = await Promise.all(['en', 'nb'].map(languageCookie => localizedBrowser(state, t, { languageCookie })));
    const address = `${state.frontendUrl}/login?changed=1`;

    // When initial SSR requests overlap and the real selectors then exchange languages.
    const initial = await Promise.all(readers.map(reader => reader.page.goto(address, { waitUntil: 'networkidle' })));
    for (const [index, locale] of ['en', 'nb'].entries()) {
      await assertLocalizedDocument(readers[index].page, initial[index], locale, messages[locale].login_label);
    }
    const selected = await Promise.all(readers.map((reader, index) => selectLanguage(reader.page, index === 0 ? 'nb' : 'en')));

    // Then both hydrated documents and repeated concurrent raw SSR responses remain isolated.
    for (const [index, locale] of ['nb', 'en'].entries()) {
      await assertLocalizedDocument(readers[index].page, selected[index], locale, messages[locale].login_label);
      assert.equal(readers[index].page.url(), address);
    }
    for (let overlap = 0; overlap < 3; overlap++) {
      const responses = await Promise.all(readers.map(reader => reader.context.request.get(address)));
      for (const [index, locale] of ['nb', 'en'].entries()) {
        assert.deepEqual(ssrState(await responses[index].text()), { locale, heading: messages[locale].login_label });
      }
    }
  });
}

async function publicEvidence(state, response, html) {
  const cookieHeader = await response.request().headerValue('cookie');
  return {
    selectedCookie: (await state.context.cookies()).find(cookie => cookie.name === 'PARAGLIDE_LOCALE')?.value,
    requestCookie: cookieHeader?.split(';').map(value => value.trim()).find(value => value.startsWith('PARAGLIDE_LOCALE=')),
    url: state.page.url(), server: ssrState(html),
    browser: { locale: await state.page.locator('html').getAttribute('lang'), heading: await state.page.locator('h1').textContent() },
  };
}
