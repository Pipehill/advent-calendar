import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { getRequestURL, type H3Event } from 'h3';

export function createNodeRequest(event: H3Event, signal: AbortSignal) {
  const method = event.method;
  const body = ['GET', 'HEAD'].includes(method)
    ? undefined
    : Readable.toWeb(event.node.req, {
        // h3's flowing adapter queues the entire unread upload. Bound this queue
        // in bytes and let the Node stream's backpressure stop its socket reads.
        strategy: { highWaterMark: 65_536, size: (chunk: Uint8Array) => chunk.byteLength },
      });
  return new Request(getRequestURL(event), {
    method,
    headers: event.headers,
    signal,
    body,
    duplex: 'half',
  } as RequestInit);
}

export async function sendUploadRejection(
  incoming: IncomingMessage,
  outgoing: ServerResponse,
  response: Response,
) {
  incoming.pause();
  const body = Buffer.from(await response.arrayBuffer());
  for (const [name, value] of response.headers) outgoing.setHeader(name, value);
  outgoing.setHeader('Content-Length', body.byteLength);
  outgoing.writeHead(response.status);
  outgoing.write(body);
  const socket = outgoing.socket;
  if (!socket) {
    outgoing.end();
    return;
  }
  // res.end() immediately destroys an unread HTTP upload's socket, racing the
  // 413 with ECONNRESET. Half-close output after the complete framed response;
  // retain paused input for at most one second, without draining rejected bytes.
  const timeout = setTimeout(() => socket.destroy(), 1000);
  socket.once('close', () => clearTimeout(timeout));
  socket.end();
}
