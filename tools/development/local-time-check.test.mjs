import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseLocalOptions, runLocal } from './run-local.mjs';

for (const frontend of ['dev', 'container']) {
  test(`Given ${frontend} mode and ambient bypass, When startup toggles the flag, Then only Compose receives explicit true then false`, async () => {
    // Given an ambient override and successful injected local services.
    const env = { CalendarOpening__DisableTimeCheck: 'true', LOCAL_NO_TIME_CHECK: 'true' };
    const starts = [];
    const children = [];
    const run = (_executable, args, _inherit, environment) => {
      if (args.includes('up')) starts.push(environment);
      if (args.includes('test') || args.includes('generate:contract')) children.push(environment);
      return { status: 0 };
    };
    const develop = async (_config, environment) => children.push(environment);

    // When skip-build launches first enable and then omit the option.
    for (const flag of [['--no-time-check'], []]) {
      const options = parseLocalOptions([`--frontend=${frontend}`, '--skip-build', ...flag]);
      await runLocal(env, run, async () => ({ ok: true }), options, develop, (_runtime, value) => value);
    }

    // Then Compose changes its backend configuration without leaking bypass into tests/Vite.
    assert.deepEqual(starts.map(value => value.LOCAL_NO_TIME_CHECK), ['true', 'false']);
    assert(children.length >= 4);
    for (const child of children) {
      assert.equal(child.CalendarOpening__DisableTimeCheck, undefined);
      assert.equal(child.LOCAL_NO_TIME_CHECK, undefined);
    }
    assert.equal(env.LOCAL_NO_TIME_CHECK, 'true');
  });
}
