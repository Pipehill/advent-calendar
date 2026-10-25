// The official SDK owns stdio framing, initialization, requests and process shutdown.
import { createRequire } from 'node:module';
import { mcpServer } from './jscpd.mjs';

const require = createRequire(new URL('./analysis/package.json', import.meta.url));
const options = { timeout: 30000 };

export async function connect(directory, configuration, server = mcpServer) {
  const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
  const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
  const client = new Client({ name: 'advent-quality', version: '1.0.0' });
  const transport = new StdioClientTransport({ ...server(directory, configuration), stderr: 'pipe' });
  let diagnostics = '';
  transport.stderr.on('data', chunk => { diagnostics = (diagnostics + chunk).slice(-8000); });
  client.onerror = error => {
    diagnostics = (diagnostics + error.message).slice(-8000);
    // Malformed protocol output invalidates pending evidence immediately.
    void client.close();
  };
  const close = () => client.close();
  try {
    await client.connect(transport, options);
    const { tools } = await client.listTools({}, options);
    for (const name of ['check_duplication', 'get_file_clones', 'get_statistics', 'check_current_directory']) {
      if (!tools.some(tool => tool.name === name && tool.inputSchema.type === 'object')) {
        throw new Error(`MCP missing tool/schema: ${name}`);
      }
    }
    return {
      server: { serverInfo: client.getServerVersion(), capabilities: client.getServerCapabilities() },
      tools, close,
      async call(name, args = {}) {
        try {
          const result = await client.callTool({ name, arguments: args }, undefined, options);
          if (result.isError) throw new Error('Invalid MCP tool result');
          return JSON.parse(result.content.filter(item => item.type === 'text').map(item => item.text).join('\n'));
        } catch (error) {
          throw new Error(`Invalid MCP tool result: ${error.message}; ${diagnostics}`);
        }
      },
    };
  } catch (error) {
    await close();
    throw new Error(`Invalid MCP connection: ${error.message}; ${diagnostics}`);
  }
}
