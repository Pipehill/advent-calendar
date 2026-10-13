import path from 'node:path';

function inspectRuntime(runtime, args, env, run) {
  const result = run(runtime, args, false, env);
  if (result.status !== 0) {
    throw new Error(`Cannot resolve Podman test endpoint: ${result.output}. Set DOCKER_HOST explicitly.`);
  }
  return JSON.parse(result.stdout);
}

export function localTestEnvironment(runtime, env, run, platform = process.platform) {
  if (!/^podman(?:\.exe)?$/i.test(path.basename(runtime))) {
    return env;
  }
  const testsEnv = { ...env };
  const info = inspectRuntime(runtime, ['info', '--format', 'json'], env, run);
  if (info.host.security.rootless && testsEnv.TESTCONTAINERS_RYUK_DISABLED === undefined) {
    // Fixture disposal still removes test containers after an ordinary test run.
    testsEnv.TESTCONTAINERS_RYUK_DISABLED = 'true';
  }
  if (testsEnv.DOCKER_HOST) {
    return testsEnv;
  }
  if (platform === 'linux' && !info.host.serviceIsRemote) {
    const socket = info.host.remoteSocket.path;
    testsEnv.DOCKER_HOST = socket.startsWith('unix://') ? socket : `unix://${socket}`;
    return testsEnv;
  }
  const connections = inspectRuntime(runtime, ['system', 'connection', 'list', '--format', 'json'], env, run);
  const connection = connections.find(item => env.CONTAINER_CONNECTION
    ? item.Name === env.CONTAINER_CONNECTION
    : item.Default);
  if (!connection?.IsMachine || env.CONTAINER_HOST) {
    throw new Error('Remote Podman tests require an explicit DOCKER_HOST. Configure it or use --skip-test.');
  }
  const machineName = connection.Name.replace(/-root$/, '');
  const [machine] = inspectRuntime(runtime, ['machine', 'inspect', machineName], env, run);
  if (platform === 'win32') {
    const pipe = machine.ConnectionInfo.PodmanPipe.Path.replace(/^\\\\\.\\pipe\\/, '');
    testsEnv.DOCKER_HOST = `npipe://localhost/pipe/${pipe}`;
  } else {
    testsEnv.DOCKER_HOST = `unix://${machine.ConnectionInfo.PodmanSocket.Path}`;
  }
  return testsEnv;
}
