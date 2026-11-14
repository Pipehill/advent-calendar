export function capturePageErrors(page, errors) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && /hydration|did not match|Minified React error/i.test(message.text())) errors.push(message.text());
  });
}
