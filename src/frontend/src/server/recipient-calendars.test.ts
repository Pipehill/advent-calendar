import { createHash } from 'node:crypto';
import { afterEach, expect, test, vi } from 'vitest';
import { createContext } from './context';
import { appRouter } from './trpc';

const id = '00000000-0000-4000-8000-000000000019';
const version = '00000000-0000-4000-8000-000000000018';
const scopeFor = (ticket: string) => createHash('sha256').update(ticket).digest('hex');
const input = { id, scope: scopeFor('recipient'), number: 24 };
const session = (role = 'calendarUser', mustChangePassword = false) => ({
  user: { role },
  mustChangePassword,
});
function caller(ticket = 'recipient') {
  return appRouter.createCaller(
    createContext(
      new Request('http://frontend.test', {
        headers: { Cookie: `advent.auth=${ticket}`, 'X-CSRF-TOKEN': 'principal-token' },
      }),
    ),
  );
}
afterEach(() => vi.restoreAllMocks());

test.each(['calendarAdmin', 'superadmin', 'restricted', 'wrong-scope'])(
  'Given %s recipient authority, When list board image and open are requested, Then all fail before content access',
  async (condition) => {
    // Given either an excluded role, a restricted session or another session's cache discriminator.
    const request = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () =>
        Response.json(
          session(
            condition === 'restricted' || condition === 'wrong-scope' ? 'calendarUser' : condition,
            condition === 'restricted',
          ),
        ),
      );
    const values = {
      ...input,
      scope: condition === 'wrong-scope' ? scopeFor('other') : input.scope,
    };

    // When every dedicated recipient operation is called directly.
    const results = await Promise.allSettled([
      caller().recipient.list({ scope: values.scope, offset: 0, limit: 12 }),
      caller().recipient.get({ id, scope: values.scope }),
      caller().recipient.image({ ...values, version }),
      caller().recipient.open(values),
    ]);

    // Then only independent session inspections occur, with no administrator fallback.
    expect(
      results.map((result) =>
        result.status === 'rejected' ? result.reason.code : 'unexpected success',
      ),
    ).toEqual(Array(4).fill('FORBIDDEN'));
    expect(
      request.mock.calls.every(([url]) => new URL(String(url)).pathname === '/auth/session'),
    ).toBe(true);
    expect(request).toHaveBeenCalledTimes(4);
  },
);

test.each([401, 403, 404, 409, 503])(
  'Given a recipient opening returning HTTP %s, When BFF translates the response, Then authority and write retry rules remain intact',
  async (status) => {
    // Given a session validated just before an opening fails at the backend.
    const request = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json(session()))
      .mockResolvedValue(Response.json({}, { status }));

    // When the explicit CSRF-protected mutation is sent.
    const result = caller().recipient.open(input);

    // Then the error is structured and only one write uses the caller's token.
    await expect(result).rejects.toMatchObject({
      code: {
        401: 'UNAUTHORIZED',
        403: 'FORBIDDEN',
        404: 'NOT_FOUND',
        409: 'CONFLICT',
        503: 'SERVICE_UNAVAILABLE',
      }[status],
    });
    expect(request).toHaveBeenCalledTimes(2);
    const [url, init] = request.mock.calls[1];
    expect(String(url)).toContain(`/recipient/calendars/${id}/doors/24/open`);
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('X-CSRF-TOKEN')).toBe('principal-token');
    expect(init?.cache).toBe('no-store');
  },
);

test('Given simultaneous recipient sessions, When paged lists and safe boards load, Then each request retains its own cookies scope and response', async () => {
  // Given concurrent callers whose safe metadata differs by authenticated session.
  const seen: string[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    const cookie = new Headers(init?.headers).get('Cookie') ?? '';
    if (new URL(String(url)).pathname === '/auth/session') return Response.json(session());
    seen.push(String(url));
    return Response.json({ title: cookie, calendars: [], totalCount: 0 });
  });

  // When separate request contexts fetch a board and paginated calendar list concurrently.
  const [board, list] = await Promise.all([
    caller('first').recipient.get({ id, scope: scopeFor('first') }),
    caller('second').recipient.list({ offset: 12, limit: 12, scope: scopeFor('second') }),
  ]);

  // Then neither operation opens a door and paging remains bounded and scoped.
  expect(board.title).toBe('advent.auth=first');
  expect(list.totalCount).toBe(0);
  expect(seen.some((url) => url.includes('offset=12') && url.includes('limit=12'))).toBe(true);
  expect(seen.every((url) => !url.includes('/open'))).toBe(true);
});

test.each([
  { ...input, number: 25 },
  { ...input, noTimeCheck: true },
  { ...input, scope: 'browser-role' },
])(
  'Given invalid recipient input %j, When opening is requested, Then Zod rejects it without a backend call',
  async (invalid) => {
    // Given malformed input or an attempted browser permission toggle.
    const request = vi.spyOn(globalThis, 'fetch');

    // When direct BFF input validation runs.
    const result = caller().recipient.open(invalid);

    // Then no network work or opening occurs.
    await expect(result).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(request).not.toHaveBeenCalled();
  },
);

test('Given a selected recipient image version, When the backend returns another version, Then the BFF withholds the stale payload', async () => {
  // Given a current recipient and an image replaced between content and image requests.
  vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(Response.json(session()))
    .mockResolvedValueOnce(Response.json({ metadata: { version: id }, data: 'private-image' }));

  // When the protected version-specific image is requested.
  const result = caller().recipient.image({ ...input, version });

  // Then no stale image bytes reach the browser.
  await expect(result).rejects.toMatchObject({ code: 'CONFLICT' });
});
