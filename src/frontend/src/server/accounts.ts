import { TRPCError } from '@trpc/server';
import type { z } from 'zod';
import {
  type CalendarClient,
  ChangeRoleRequestRole,
  CreateUserRequestRole,
  type UserDto,
} from '../generated/backend';
import {
  accountName,
  type accountPageInput,
  type CreateAccountInput,
  type resetAccountInput,
  type roleAccountInput,
  type statusAccountInput,
  validPassword,
} from '../lib/account-input';
import { callBackend } from './backend';
import type { RequestContext } from './context';

export function accountMetadata({
  id,
  name,
  username,
  role,
  enabled,
  responsibleAdministratorId,
}: UserDto) {
  return {
    id,
    name,
    username,
    role,
    enabled,
    responsibleAdministratorId: responsibleAdministratorId ?? null,
  };
}
export type AccountMetadata = ReturnType<typeof accountMetadata>;

export async function requireAdministrator(
  client: CalendarClient,
  signal: AbortSignal,
  superadmin = false,
) {
  const session = await client.session(signal);
  if (
    session.mustChangePassword ||
    !['superadmin', 'calendarAdmin'].includes(session.user.role) ||
    (superadmin && session.user.role !== 'superadmin')
  ) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'FORBIDDEN' });
  }
  return session;
}

// The existing backend list applies SQL authorization and deterministic ordering.
// Scan within the same total deadline, never fetch unrestricted data for a calendaradmin.
async function findAccount(
  client: CalendarClient,
  signal: AbortSignal,
  predicate: (user: UserDto) => boolean,
) {
  for (let offset = 0; offset <= 1_000_000; offset += 100) {
    const page = await client.listUsers(offset, 100, signal);
    const index = page.users.findIndex(predicate);
    if (index !== -1) return { user: page.users[index], index: offset + index };
    if (page.users.length < 100) break;
  }
  return undefined;
}

export function listAccounts(context: RequestContext, input: z.infer<typeof accountPageInput>) {
  return callBackend(context, async (client, signal) => {
    await requireAdministrator(client, signal);
    const found = input.focusId
      ? await findAccount(client, signal, (user) => user.id === input.focusId)
      : undefined;
    const offset = found ? Math.floor(found.index / input.limit) * input.limit : input.offset;
    const page = await client.listUsers(offset, input.limit, signal);
    return {
      users: page.users.map(accountMetadata),
      hasMore: page.users.length === input.limit,
      offset,
    };
  });
}

export function responsibleAdministrators(context: RequestContext) {
  return callBackend(context, async (client, signal) => {
    await requireAdministrator(client, signal, true);
    const administrators: { id: string; name: string; username: string }[] = [];
    for (let offset = 0; offset <= 1_000_000; offset += 100) {
      const page = await client.listUsers(offset, 100, signal);
      for (const user of page.users)
        if (user.role === 'calendarAdmin')
          administrators.push({ id: user.id, name: user.name, username: user.username });
      if (page.users.length < 100) return administrators;
    }
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Account list exceeds pagination bounds' });
  });
}

function invalidField(field: string) {
  throw new TRPCError({
    code: 'BAD_REQUEST',
    message: 'BAD_REQUEST',
    cause: new AdministrationFieldError(field),
  });
}
export class AdministrationFieldError extends Error {
  constructor(public readonly field: string) {
    super('Invalid administration field');
  }
}

async function requireResponsible(
  client: CalendarClient,
  signal: AbortSignal,
  id: string | undefined,
  targetId?: string,
) {
  if (!id || id === targetId) invalidField('responsibleAdministratorId');
  const found = await findAccount(client, signal, (user) => user.id === id);
  if (found?.user.role !== 'calendarAdmin') invalidField('responsibleAdministratorId');
}

export function createAccount(context: RequestContext, input: CreateAccountInput) {
  return callBackend(context, async (client, signal) => {
    const session = await requireAdministrator(client, signal);
    if (session.user.role === 'calendarAdmin') {
      if (input.role !== 'calendarUser' || input.responsibleAdministratorId !== undefined)
        throw new TRPCError({ code: 'FORBIDDEN', message: 'FORBIDDEN' });
    } else if (input.role === 'calendarUser')
      await requireResponsible(client, signal, input.responsibleAdministratorId);
    const result = await client.createUser(
      {
        ...input,
        name: accountName.parse(input.name),
        role:
          input.role === 'calendarAdmin'
            ? CreateUserRequestRole.CalendarAdmin
            : CreateUserRequestRole.CalendarUser,
      },
      signal,
    );
    return accountMetadata(result);
  });
}

async function requireTarget(
  client: CalendarClient,
  signal: AbortSignal,
  id: string,
  superadmin: boolean,
) {
  const session = await requireAdministrator(client, signal, superadmin);
  const found = await findAccount(client, signal, (user) => user.id === id);
  const target = found?.user;
  if (
    !target ||
    target.id === session.user.id ||
    target.role === 'superadmin' ||
    (session.user.role === 'calendarAdmin' &&
      (target.role !== 'calendarUser' || target.responsibleAdministratorId !== session.user.id))
  ) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'FORBIDDEN' });
  }
  return target;
}

export function resetAccount(context: RequestContext, input: z.infer<typeof resetAccountInput>) {
  return callBackend(context, async (client, signal) => {
    const target = await requireTarget(client, signal, input.id, false);
    if (!validPassword(input.password, target.role === 'calendarAdmin')) invalidField('password');
    await client.resetPassword({ password: input.password }, input.id, signal);
    return { ok: true };
  });
}

export function changeAccountStatus(
  context: RequestContext,
  input: z.infer<typeof statusAccountInput>,
) {
  return callBackend(context, async (client, signal) => {
    await requireTarget(client, signal, input.id, true);
    await client.changeStatus({ enabled: input.enabled }, input.id, signal);
    return { ok: true };
  });
}

export function changeAccountRole(
  context: RequestContext,
  input: z.infer<typeof roleAccountInput>,
) {
  return callBackend(context, async (client, signal) => {
    const target = await requireTarget(client, signal, input.id, true);
    if (target.role === input.role) throw new TRPCError({ code: 'CONFLICT', message: 'CONFLICT' });
    if (input.role === 'calendarUser') {
      if (target.responsibleAdministratorId && input.responsibleAdministratorId !== undefined)
        invalidField('responsibleAdministratorId');
      await requireResponsible(
        client,
        signal,
        target.responsibleAdministratorId ?? input.responsibleAdministratorId,
        target.id,
      );
    }
    await client.changeRole(
      {
        role:
          input.role === 'calendarAdmin'
            ? ChangeRoleRequestRole.CalendarAdmin
            : ChangeRoleRequestRole.CalendarUser,
        temporaryPassword: input.temporaryPassword,
        responsibleAdministratorId: input.responsibleAdministratorId,
      },
      input.id,
      signal,
    );
    return { ok: true };
  });
}
