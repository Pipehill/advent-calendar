import { expect, test } from 'vitest';
import { backendConfiguration } from './configuration';

const production = {
  NODE_ENV: 'production',
  BACKEND_API_URL: 'http://backend.private:8080',
  PUBLIC_ORIGIN: 'https://advent.example',
};

test.each(['BACKEND_API_URL', 'PUBLIC_ORIGIN'])(
  'Given missing Production %s, When hosting configuration loads, Then startup is rejected',
  (name) => {
    // Given an otherwise complete deployment with one absent required value.
    const env = { ...production, [name]: '' };

    // When runtime configuration is evaluated before serving requests.
    const configure = () => backendConfiguration(env);

    // Then Production cannot silently use local defaults.
    expect(configure).toThrow(/Production configuration requires/);
  },
);

test.each([
  ['PUBLIC_ORIGIN', 'http://advent.example'],
  ['PUBLIC_ORIGIN', 'https://advent.example/path'],
  ['PUBLIC_ORIGIN', 'https://user:secret@advent.example'],
  ['PUBLIC_ORIGIN', 'https://advent.example?key=value'],
  ['PUBLIC_ORIGIN', 'https://advent.example#fragment'],
  ['BACKEND_API_URL', 'file:///tmp/backend'],
  ['BACKEND_API_URL', 'http://user:secret@backend.private'],
  ['BACKEND_API_URL', 'http://backend.private/path'],
  ['BACKEND_API_URL', 'malformed'],
  ['BACKEND_DEADLINE_MS', '0'],
  ['BACKEND_DEADLINE_MS', '1.5'],
  ['BACKEND_DEADLINE_MS', '2147483648'],
])(
  'Given invalid %s value %s, When Production configuration loads, Then the deployment fails without printing values',
  (name, value) => {
    // Given one malformed deployment value that must not enter logs verbatim.
    const env = { ...production, [name]: value };

    // When hosting validates explicit origins and the total deadline.
    const configure = () => backendConfiguration(env);

    // Then the named configuration error is useful without exposing its value.
    expect(configure).toThrow(/configuration/);
    expect(configure).not.toThrow(value);
  },
);

test('Given explicit Production origins, When hosting configuration loads, Then both backend access and forwarding use validated deployment settings', () => {
  // Given a canonical HTTPS origin and private HTTP backend with trailing slashes.
  const env = {
    ...production,
    BACKEND_API_URL: `${production.BACKEND_API_URL}/`,
    PUBLIC_ORIGIN: `${production.PUBLIC_ORIGIN}/`,
    BACKEND_DEADLINE_MS: '5000',
  };

  // When hosting normalizes its server-only configuration.
  const result = backendConfiguration(env);

  // Then endpoint construction and forwarded scheme have one validated source.
  expect(result).toEqual({
    baseUrl: production.BACKEND_API_URL,
    deadlineMs: 5000,
    publicOrigin: production.PUBLIC_ORIGIN,
    forwardedScheme: 'https',
  });
});

test('Given Development without deployment settings, When configuration loads, Then local HTTP remains available without proxy assertions', () => {
  // Given a local Development process without production-only settings.
  const env = { NODE_ENV: 'development' };

  // When the same configuration owner initializes local operation.
  const result = backendConfiguration(env);

  // Then the existing local backend/deadline defaults remain usable.
  expect(result).toEqual({
    baseUrl: 'http://localhost:8080',
    deadlineMs: 10_000,
    publicOrigin: undefined,
    forwardedScheme: undefined,
  });
});
