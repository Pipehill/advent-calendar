import assert from 'node:assert/strict';

export async function createBrowserReader(state, t, options = {}) {
  const context = await state.context.browser().newContext(options);
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  capturePageErrors(page, errors);
  t.after(async () => {
    try { assert.deepEqual(errors, [], 'No page or hydration errors'); }
    finally { await context.close(); }
  });
  return { ...state, context, page };
}

export function capturePageErrors(page, errors) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && /hydration|did not match|Minified React error/i.test(message.text())) errors.push(message.text());
  });
}
