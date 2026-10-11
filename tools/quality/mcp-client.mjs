// Minimal newline-delimited JSON-RPC client for jscpd's built-in stdio server.
import { launchMcp } from './jscpd.mjs';

export async function connect(directory, configuration, launch = launchMcp) {
  const child = launch(directory, configuration);
  const pending = new Map();
  let sequence = 0;
  let buffer = '';
  let diagnostics = '';
  child.stderr.on('data', chunk => { diagnostics = (diagnostics + chunk).slice(-8000); });
  function fail(error) {
    for (const { reject, timer } of pending.values()) {
      clearTimeout(timer);
      reject(error);
    }
    pending.clear();
  }
  child.on('error', fail);
  child.stdin.on('error', fail);
  child.on('exit', code => fail(new Error(`MCP exited ${code}: ${diagnostics}`)));
  child.stdout.on('data', chunk => {
    buffer += chunk;
    let end;
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 1);
      if (!line.trim()) continue;
      let message;
      try { message = JSON.parse(line); } catch {
        fail(new Error(`Invalid MCP protocol output: ${line.slice(0, 200)}`));
        child.kill();
        return;
      }
      const request = pending.get(message.id);
      if (!request) continue;
      pending.delete(message.id);
      clearTimeout(request.timer);
      if (message.error) request.reject(new Error(JSON.stringify(message.error)));
      else request.resolve(message.result);
    }
  });
  function request(method, params) {
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`MCP timeout: ${method}; ${diagnostics}`));
      }, 30000);
      pending.set(id, { resolve, reject, timer });
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }
  const close = async () => {
    fail(new Error('MCP client closed'));
    if (child.exitCode !== null) return;
    await new Promise(resolve => {
      const timer = setTimeout(() => child.kill(), 1000);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
      child.stdin.end();
    });
  };
  try {
    const server = await request('initialize', {
      protocolVersion: '2024-11-05', capabilities: {},
      clientInfo: { name: 'advent-quality', version: '1.0.0' },
    });
    if (!server?.serverInfo || !server.capabilities?.tools) throw new Error('Invalid MCP initialization');
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    const { tools } = await request('tools/list', {});
    for (const name of ['check_duplication', 'get_file_clones', 'get_statistics', 'check_current_directory']) {
      if (!tools?.some(tool => tool.name === name && tool.inputSchema?.type === 'object')) {
        throw new Error(`MCP missing tool/schema: ${name}`);
      }
    }
    return {
      server, tools, close,
      async call(name, args = {}) {
        const result = await request('tools/call', { name, arguments: args });
        if (result?.isError || !Array.isArray(result?.content)) {
          throw new Error(`Invalid MCP tool result: ${JSON.stringify(result)}`);
        }
        const text = result.content.filter(item => item.type === 'text').map(item => item.text).join('\n');
        try { return JSON.parse(text); } catch {
          throw new Error(`MCP tool did not return JSON: ${text.slice(0, 200)}`);
        }
      },
    };
  } catch (error) {
    await close();
    throw error;
  }
}
