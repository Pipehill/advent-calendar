export interface BackendConfiguration {
  baseUrl: string;
  deadlineMs: number;
  publicOrigin?: string;
  forwardedScheme?: 'https';
}

export function backendConfiguration(env: NodeJS.ProcessEnv = process.env): BackendConfiguration {
  const production = env.NODE_ENV === 'production';
  if (production && (!env.BACKEND_API_URL || !env.PUBLIC_ORIGIN)) {
    throw new Error('Production configuration requires BACKEND_API_URL and PUBLIC_ORIGIN');
  }

  const backend = parseOrigin(env.BACKEND_API_URL || 'http://localhost:8080', 'BACKEND_API_URL');
  const deadlineMs = Number(env.BACKEND_DEADLINE_MS || 10_000);
  if (!Number.isInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > 2_147_483_647) {
    throw new Error('Invalid backend deadline configuration');
  }

  const publicOrigin = env.PUBLIC_ORIGIN
    ? parseOrigin(env.PUBLIC_ORIGIN, 'PUBLIC_ORIGIN')
    : undefined;
  if (publicOrigin && publicOrigin.protocol !== 'https:') {
    throw new Error('PUBLIC_ORIGIN configuration must use HTTPS');
  }
  return {
    baseUrl: backend.origin,
    deadlineMs,
    publicOrigin: publicOrigin?.origin,
    // Only deployment configuration establishes this hop's external scheme.
    forwardedScheme: production ? 'https' : undefined,
  };
}

function parseOrigin(value: string, name: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Invalid ${name} configuration`);
  }
  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    parsed.pathname !== '/'
  ) {
    throw new Error(
      `Invalid ${name} configuration: an HTTP origin without credentials is required`,
    );
  }
  return parsed;
}

let runtimeConfiguration: BackendConfiguration | undefined;

export function getRuntimeConfiguration() {
  runtimeConfiguration ??= backendConfiguration();
  return runtimeConfiguration;
}
