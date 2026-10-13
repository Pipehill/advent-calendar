import { setTimeout as delay } from 'node:timers/promises';
import { TRPCError } from '@trpc/server';
import { CalendarClient } from '../generated/backend';
import type { RequestContext } from './context';

const retryStatuses = new Set([502, 503, 504]);
const statusCodes = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  502: 'SERVICE_UNAVAILABLE',
  503: 'SERVICE_UNAVAILABLE',
  504: 'SERVICE_UNAVAILABLE',
} as const;

export class BackendProblem extends Error {
  constructor(
    public readonly status: number,
    public readonly errors: Record<string, string[]> = {},
  ) {
    super('Backend request failed');
  }
}

export function translateError(error: unknown) {
  if (error instanceof TRPCError) return error;
  if (error instanceof BackendProblem) {
    const code = statusCodes[error.status as keyof typeof statusCodes] ?? 'INTERNAL_SERVER_ERROR';
    return new TRPCError({ code, message: code, cause: error });
  }
  const code = error instanceof TypeError ? 'SERVICE_UNAVAILABLE' : 'INTERNAL_SERVER_ERROR';
  return new TRPCError({ code, message: code });
}

export function backendConfiguration(env: NodeJS.ProcessEnv = process.env) {
  const baseUrl = env.BACKEND_API_URL || 'http://localhost:8080';
  const deadlineMs = Number(env.BACKEND_DEADLINE_MS || 10_000);
  const parsed = new URL(baseUrl);
  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    !Number.isInteger(deadlineMs) ||
    deadlineMs < 1
  ) {
    throw new Error('Invalid backend URL or deadline configuration');
  }
  return { baseUrl, deadlineMs };
}

export async function retrieveCalendar(
  id: string,
  context: RequestContext,
  configuration = backendConfiguration(),
  request: typeof fetch = fetch,
) {
  const deadline = AbortSignal.timeout(configuration.deadlineMs);
  const signal = AbortSignal.any([context.signal, deadline]);
  const transport = {
    async fetch(url: RequestInfo | URL, init?: RequestInit) {
      for (let attempt = 0; attempt < 2; attempt++) {
        signal.throwIfAborted();
        try {
          const response = await request(url, {
            ...init,
            signal,
            headers: { ...init?.headers, traceparent: context.traceparent },
          });
          if (response.ok) return response;
          if (attempt === 0 && retryStatuses.has(response.status)) {
            await response.body?.cancel();
            await delay(300, undefined, { signal });
            continue;
          }
          const problem: unknown = await response.json().catch(() => null);
          const errors = extractFieldErrors(problem);
          throw new BackendProblem(response.status, errors);
        } catch (error) {
          if (signal.aborted) throw error;
          if (attempt === 0 && error instanceof TypeError) {
            await delay(300, undefined, { signal });
            continue;
          }
          throw error;
        }
      }
      throw new Error('Backend retry exhausted');
    },
  };
  try {
    return await new CalendarClient(configuration.baseUrl, transport).get(id, signal);
  } catch (error) {
    if (context.signal.aborted) {
      throw new TRPCError({ code: 'CLIENT_CLOSED_REQUEST', message: 'CLIENT_CLOSED_REQUEST' });
    }
    if (deadline.aborted) throw new TRPCError({ code: 'TIMEOUT', message: 'TIMEOUT' });
    throw translateError(error);
  }
}

function extractFieldErrors(problem: unknown): Record<string, string[]> {
  if (
    !problem ||
    typeof problem !== 'object' ||
    !('errors' in problem) ||
    !problem.errors ||
    typeof problem.errors !== 'object'
  )
    return {};
  return Object.fromEntries(
    Object.entries(problem.errors).filter(
      ([, value]) => Array.isArray(value) && value.every((item) => typeof item === 'string'),
    ),
  );
}
