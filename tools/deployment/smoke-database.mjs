import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { command, runtime } from './smoke-runtime.mjs';

const tables = ['accounts', 'account_sessions', 'calendars', 'doors', 'door_openings', 'schemaversions'];
const literal = value => `'${value.replaceAll("'", "''")}'`;

// These checks operate only on the harness-owned database and credentials.
// The binary dump and credential-bearing stdin/environment never enter logs.
export async function verifyDatabase(stack, directory, calendarId) {
  const source = stack.connection.match(/(?:^|;)Database=([^;]+)/)?.[1];
  const originalPassword = stack.connection.match(/(?:^|;)Password=([^;]+)/)?.[1];
  if (!/^browser_[a-f0-9]{8}$/.test(source ?? '') || !originalPassword ||
      !/^[a-f0-9-]{36}$/.test(calendarId)) throw new Error('Only isolated smoke databases and calendars are supported');
  const restored = `browser_restore_${randomUUID().replaceAll('-', '')}`;
  let restoreCreated = false;
  let passwordChanged = false;
  const operator = (database, sql) => psql(stack, database, sql);
  const application = (database, sql, password = originalPassword) => psql(stack, database, sql, password);

  try {
    assert.equal(application(source,
      "SELECT rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls FROM pg_roles WHERE rolname=current_user;"), 'f');
    for (const operation of ['CREATE ROLE smoke_forbidden;', 'CREATE DATABASE smoke_forbidden;', 'SET ROLE postgres;']) {
      assert.throws(() => application(source, operation), /42501/, 'Restricted application identity cannot escalate privileges');
    }
    for (const database of ['postgres', 'template1']) {
      assert.throws(() => application(database, 'SELECT 1;'), /permission denied for database/,
        'Application identity cannot connect to maintenance databases');
    }
    const expected = snapshot(application, source);
    assert(Number(expected.accounts.count) > 0);
    assert(Number(expected.doors.count) >= 24);
    assert(Number(expected.door_openings.count) > 0);
    assert(Number(expected.schemaversions.count) > 0);
    assert.equal(application(source,
      `SELECT count(*) FROM doors WHERE calendar_id=${literal(calendarId)}::uuid AND image_data IS NOT NULL;`), '1');

    const dump = command(runtime, [
      'exec', '--env', 'PGPASSWORD', stack.database, 'pg_dump', `--host=${stack.database}`, '--username=advent_app',
      `--dbname=${source}`, '--format=custom',
    ], { encoding: null, env: { ...process.env, PGPASSWORD: originalPassword } });
    assert.equal(dump.subarray(0, 5).toString('ascii'), 'PGDMP', 'Custom archive is transferred without text conversion');
    const backup = path.join(directory, 'database.dump');
    fs.writeFileSync(backup, dump, { mode: 0o600 });
    operator('postgres', `CREATE DATABASE ${restored} OWNER advent_app;`);
    restoreCreated = true;
    operator('postgres', `REVOKE ALL ON DATABASE ${restored} FROM PUBLIC;`);
    command(runtime, [
      'exec', '-i', stack.database, 'pg_restore', '--username=postgres',
      `--dbname=${restored}`, '--exit-on-error', '--single-transaction', '--no-password',
    ], { input: fs.readFileSync(backup), encoding: null });
    assert.deepEqual(snapshot(application, restored), expected,
      'Restored accounts, sessions, calendars, doors/images, opening history and migration journal match');
    assert.equal(operator(restored, "SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname='public';"), 'advent_app');
    assert.equal(operator(restored, "SELECT EXISTS (SELECT 1 FROM pg_namespace, LATERAL aclexplode(nspacl) permission WHERE nspname='public' AND grantee=0);"), 'f');

    const replacementPassword = randomUUID();
    operator(source, `ALTER ROLE advent_app PASSWORD ${literal(replacementPassword)};`);
    passwordChanged = true;
    assert.throws(() => application(source, 'SELECT 1;'), /password authentication failed/,
      'The previous application password is rejected on a new connection');
    assert.equal(application(source, 'SELECT current_user;', replacementPassword), 'advent_app');
    await stack.restart(replacementPassword);
    assert.deepEqual(snapshot((database, sql) => application(database, sql, replacementPassword), source), expected,
      'Credential rotation preserves existing application data');
    console.log('Database smoke passed: restricted-role boundaries, binary custom backup, isolated content restore and backend credential rotation.');
  } finally {
    if (passwordChanged) {
      operator(source, `ALTER ROLE advent_app PASSWORD ${literal(originalPassword)};`);
      await stack.restart(originalPassword);
    }
    if (restoreCreated) operator('postgres', `DROP DATABASE ${restored};`);
  }
}

function psql(stack, database, sql, password) {
  const authenticated = password !== undefined;
  return command(runtime, [
    'exec', '-i', ...(authenticated ? ['--env', 'PGPASSWORD'] : []), stack.database, 'psql',
    // Use the private network address, because initdb's local/loopback rules may
    // trust socket/localhost clients independently from the network password.
    ...(authenticated ? [`--host=${stack.database}`, '--username=advent_app'] : ['--username=postgres']),
    `--dbname=${database}`, '--no-psqlrc', '--quiet', '--no-align', '--tuples-only',
    '--set=ON_ERROR_STOP=1', '--set=VERBOSITY=sqlstate',
  ], { input: `${sql}\n`, env: authenticated ? { ...process.env, PGPASSWORD: password } : process.env }).trim();
}

function snapshot(query, database) {
  const entries = tables.map(table => `SELECT '${table}' AS name, json_build_object(
    'count', count(*),
    'checksum', md5(coalesce(string_agg(row_to_json(record)::text, '' ORDER BY row_to_json(record)::text), ''))
  ) AS value FROM ${table} record`);
  return JSON.parse(query(database, `SELECT json_object_agg(name, value) FROM (${entries.join(' UNION ALL ')}) contents;`));
}
