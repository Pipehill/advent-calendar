// Only document GETs can be replayed here; callers still perform each write once.
export async function navigateDocument(page, url) {
  const options = { waitUntil: 'networkidle' };
  try {
    return await page.goto(url, options);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('net::ERR_NETWORK_CHANGED')) throw error;
  }
  // Chromium can observe a transient interface change after the isolated stack starts.
  // Retry once; persistent network failures and all other errors still fail validation.
  return page.goto(url, options);
}
