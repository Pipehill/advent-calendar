import { createHash } from 'node:crypto';
import { afterEach, expect, test, vi } from 'vitest';
import { createContext } from './context';
import { appRouter } from './trpc';

const id = '00000000-0000-4000-8000-000000000001';
const version = '00000000-0000-4000-8000-000000000002';
const scope = createHash('sha256').update('owner').digest('hex');
const context = () =>
  createContext(
    new Request('http://frontend.test', {
      headers: { cookie: 'advent.auth=owner', 'X-CSRF-TOKEN': 'owner-token' },
    }),
  );
const image = {
  data: 'AQID',
  metadata: { version, mediaType: 'image/png', width: 20, height: 10 },
};
afterEach(() => vi.restoreAllMocks());

test.each([
  ['calendarAdmin', 'owner-edit', `/calendars/${id}/doors/7/image`],
  ['calendarAdmin', 'owner-preview', `/calendars/${id}/doors/7/image`],
  ['superadmin', 'system-preview', `/administration/calendars/${id}/preview/doors/7/image`],
] as const)(
  'Given validated %s in %s, When one image is queried, Then only its dedicated route is used',
  async (role, mode, route) => {
    // Given a validated session and one selected image version.
    const request = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json({ user: { role }, mustChangePassword: false }))
      .mockResolvedValueOnce(Response.json(image));

    // When the scoped query crosses the BFF and generated client.
    const result = await appRouter
      .createCaller(context())
      .calendar.image({ id, number: 7, version, mode, scope });

    // Then a single protected payload is read without broad calendar/image preloading.
    expect(result).toEqual(image);
    expect(request).toHaveBeenCalledTimes(2);
    expect(String(request.mock.calls[1][0])).toBe(`http://localhost:8080${route}`);
    expect(request.mock.calls[1][1]?.cache).toBe('no-store');
  },
);

test.each(['restricted', 'user', 'wrong-mode', 'old-session'])(
  'Given %s image authority, When a direct query is attempted, Then it is denied before reading bytes',
  async (scenario) => {
    // Given a current session incompatible with the requested scope or mode.
    const role = scenario === 'user' ? 'calendarUser' : 'calendarAdmin';
    const request = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        Response.json({ user: { role }, mustChangePassword: scenario === 'restricted' }),
      );
    const caller = appRouter.createCaller(context());

    // When route guards are bypassed with a crafted image query.
    const result = caller.calendar.image({
      id,
      number: 7,
      version,
      scope: scenario === 'old-session' ? 'a'.repeat(64) : scope,
      mode: scenario === 'wrong-mode' ? 'system-preview' : 'owner-edit',
    });

    // Then neither a claimed cache key nor a claimed mode grants image access.
    await expect(result).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(request).toHaveBeenCalledTimes(1);
  },
);

test('Given an old image version, When replacement has already committed, Then the old query cannot receive the replacement bytes', async () => {
  // Given a backend returning a newer persisted version.
  vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(
      Response.json({ user: { role: 'calendarAdmin' }, mustChangePassword: false }),
    )
    .mockResolvedValueOnce(
      Response.json({ ...image, metadata: { ...image.metadata, version: id } }),
    );

  // When the old selected version is queried.
  const result = appRouter
    .createCaller(context())
    .calendar.image({ id, number: 7, version, scope, mode: 'owner-preview' });

  // Then conflicting bytes are withheld from the old query key.
  await expect(result).rejects.toMatchObject({ code: 'CONFLICT' });
});

test('Given an explicit replacement, When the backend rejects its size, Then one CSRF-protected write returns a structured upload error', async () => {
  // Given a validated owner followed by an independently enforced source limit.
  const request = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(
      Response.json({ user: { role: 'calendarAdmin' }, mustChangePassword: false }),
    )
    .mockResolvedValueOnce(
      Response.json({ errors: { imageData: ['Too large'] } }, { status: 413 }),
    );
  const input = {
    id,
    number: 7,
    title: 'Gift',
    text: '',
    imageAction: 'replace' as const,
    imageData: 'AQID',
  };

  // When the common save forwards all content together.
  const result = appRouter.createCaller(context()).calendar.saveDoor(input);

  // Then no retry occurs and image fields/CSRF survive the generated client.
  await expect(result).rejects.toMatchObject({
    code: 'PAYLOAD_TOO_LARGE',
    cause: { errors: { imageData: ['Too large'] } },
  });
  expect(request).toHaveBeenCalledTimes(2);
  expect(JSON.parse(String(request.mock.calls[1][1]?.body))).toEqual({
    title: 'Gift',
    text: '',
    imageAction: 'replace',
    imageData: 'AQID',
  });
  expect(new Headers(request.mock.calls[1][1]?.headers).get('X-CSRF-TOKEN')).toBe('owner-token');
});
