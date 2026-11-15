import { expect, test, vi } from 'vitest';
import { createLoginTransition } from './login-transition';

test('Given a held login response, When submission is repeated through document navigation, Then exactly one login and navigation occur', async () => {
  // Given an authentication response held independently from document navigation.
  let release!: () => void;
  const authenticate = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  const navigate = vi.fn();
  const pending = vi.fn();
  const transition = createLoginTransition(authenticate, navigate);
  const input = { username: 'recipient', password: 'Original!Password' };

  // When rapid submissions happen both before and after accepted authentication.
  const first = transition.submit(input, pending);
  await transition.submit(input, pending);
  release();
  await first;
  await transition.submit(input, pending);

  // Then the old document remains latched until replacement without another write.
  expect(authenticate).toHaveBeenCalledTimes(1);
  expect(navigate).toHaveBeenCalledTimes(1);
  expect(pending).toHaveBeenCalledTimes(1);
});

test('Given rejected credentials, When the user corrects and retries them, Then login is editable and the corrected values authenticate', async () => {
  // Given a generic failure followed by an accepted corrected credential.
  const authenticate = vi.fn().mockRejectedValueOnce(new Error('Denied')).mockResolvedValueOnce({});
  const navigate = vi.fn();
  const transition = createLoginTransition(authenticate, navigate);

  // When the first attempt fails and a corrected attempt is submitted.
  const rejected = transition.submit({ username: 'recipient', password: 'wrong' }, vi.fn());
  await expect(rejected).rejects.toThrow('Denied');
  await transition.submit({ username: 'recipient', password: 'Corrected!Password' }, vi.fn());

  // Then only actual accepted authentication begins document navigation.
  expect(authenticate).toHaveBeenCalledTimes(2);
  expect(authenticate).toHaveBeenLastCalledWith({
    username: 'recipient',
    password: 'Corrected!Password',
  });
  expect(navigate).toHaveBeenCalledTimes(1);
});

test('Given accepted login and a synchronous navigation failure, When retried, Then navigation resolves without replaying any credentials', async () => {
  // Given successful authentication followed by a blocked document replacement.
  const authenticate = vi.fn().mockResolvedValue({});
  const navigate = vi.fn().mockImplementationOnce(() => {
    throw new Error('Navigation blocked');
  });
  const transition = createLoginTransition(authenticate, navigate);

  // When navigation fails once, then retry is requested with different form text.
  const rejected = transition.submit(
    { username: 'recipient', password: 'Original!Password' },
    vi.fn(),
  );
  await expect(rejected).rejects.toThrow('Navigation blocked');
  await transition.submit({ username: 'edited', password: 'never-replayed' }, vi.fn());

  // Then accepted authentication survives only as a flag and no second login is issued.
  expect(transition.authenticated).toBe(true);
  expect(authenticate).toHaveBeenCalledTimes(1);
  expect(navigate).toHaveBeenCalledTimes(2);
});
