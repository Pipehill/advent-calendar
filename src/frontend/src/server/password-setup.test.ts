import { afterEach, expect, test, vi } from 'vitest';
import { createContext } from './context';
import { appRouter } from './trpc';

afterEach(() => vi.restoreAllMocks());

function caller() {
  const context = createContext(
    new Request('http://front.test', {
      headers: { cookie: 'advent.auth=restricted; advent.csrf=csrf', 'X-CSRF-TOKEN': 'bound' },
    }),
  );
  return { context, auth: appRouter.createCaller(context).auth };
}

test('Given a restricted caller, When setup completes, Then only the replacement and principal-bound credentials reach the API', async () => {
  // Given the backend completes setup and deletes the revoked session cookie.
  const { context, auth } = caller();
  const request = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(null, {
      status: 204,
      headers: { 'Set-Cookie': 'advent.auth=; Path=/; HttpOnly; Max-Age=0' },
    }),
  );

  // When the independent setup mutation receives only the new password.
  const result = await auth.completePasswordSetup({ newPassword: 'Replacement!WithUnicodeÆ' });

  // Then no old password, identity flag, token or credential is returned or replayed.
  expect(result).toEqual({ ok: true });
  expect(request).toHaveBeenCalledTimes(1);
  const [url, init] = request.mock.calls[0];
  expect(String(url)).toContain('/auth/complete-password-setup');
  expect(JSON.parse(String(init?.body))).toEqual({ newPassword: 'Replacement!WithUnicodeÆ' });
  expect(new Headers(init?.headers).get('X-CSRF-TOKEN')).toBe('bound');
  expect(new Headers(init?.headers).get('cookie')).toBe('advent.auth=restricted; advent.csrf=csrf');
  expect(init?.cache).toBe('no-store');
  expect(context.responseHeaders.getSetCookie()).toHaveLength(1);
});

test.each([
  {},
  { newPassword: null },
  { newPassword: 'short' },
  { newPassword: 'Replacement!Valid', currentPassword: 'must-not-replay' },
  { newPassword: 'Replacement!Valid', restricted: true },
  { newPassword: `Æa!${'x'.repeat(126)}` },
])(
  'Given invalid setup input %j, When submitted, Then strict validation prevents API access',
  async (input) => {
    // Given a direct caller attempting to bypass the browser form.
    const { auth } = caller();
    const request = vi.spyOn(globalThis, 'fetch');

    // When missing, null, weak, oversized or unexpected fields reach the BFF.
    const result = auth.completePasswordSetup(input as { newPassword: string });

    // Then no unsafe request can be issued.
    await expect(result).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(request).not.toHaveBeenCalled();
  },
);

test.each([
  [400, 'BAD_REQUEST'],
  [401, 'UNAUTHORIZED'],
  [403, 'FORBIDDEN'],
  [409, 'CONFLICT'],
  [429, 'TOO_MANY_REQUESTS'],
  [503, 'SERVICE_UNAVAILABLE'],
])(
  'Given setup denial %s, When the backend rejects it, Then %s is preserved without a write retry',
  async (status, code) => {
    // Given the backend independently denies session eligibility or proposal policy.
    const { auth } = caller();
    const request = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        Response.json({ errors: { newPassword: ['Invalid'] } }, { status: Number(status) }),
      );

    // When the new-password-only operation crosses the request-local transport.
    const result = auth.completePasswordSetup({ newPassword: 'Replacement!WithUnicodeÆ' });

    // Then the structured error remains available and writes are never retried.
    await expect(result).rejects.toMatchObject({
      code,
      cause: { errors: { newPassword: ['Invalid'] } },
    });
    expect(request).toHaveBeenCalledTimes(1);
  },
);

test('Given a voluntary change without its current password, When submitted, Then it remains invalid independently of required setup', async () => {
  // Given a direct caller using the unchanged voluntary operation.
  const { auth } = caller();
  const request = vi.spyOn(globalThis, 'fetch');

  // When only a replacement is supplied to the current-password contract.
  const result = auth.changePassword({ newPassword: 'Replacement!Valid' } as Parameters<
    typeof auth.changePassword
  >[0]);

  // Then setup has not weakened voluntary current-password verification.
  await expect(result).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  expect(request).not.toHaveBeenCalled();
});
