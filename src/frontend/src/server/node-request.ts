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
  rejectedBody: ReadableStream<Uint8Array> | null,
) {
  const body = Buffer.from(await response.arrayBuffer());
  for (const [name, value] of response.headers) outgoing.setHeader(name, value);
  outgoing.setHeader('Content-Length', body.byteLength);
  outgoing.writeHead(response.status);
  outgoing.write(body);
  try {
    // Let already-sent bytes finish without retaining them. Immediate destruction
    // races the 413 with a reset; half-closing can stall TCP port forwarders.
    if (rejectedBody) await discardRejectedBytes(rejectedBody);
  } finally {
    incoming.pause();
    outgoing.end();
  }
}

async function discardRejectedBytes(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<undefined>((resolve) => {
    timeout = setTimeout(() => resolve(undefined), 1000);
  });
  try {
    let discarded = 0;
    // Cover ordinary oversized uploads/batches while bounding hostile input.
    // Reading the existing stream keeps its 64 KiB queue under backpressure.
    while (discarded < 32 * 1024 * 1024) {
      const chunk = await Promise.race([reader.read(), expired]);
      if (!chunk || chunk.done) break;
      discarded += chunk.value.byteLength;
    }
  } catch {
    // A disconnected upload needs only the same bounded connection cleanup.
  } finally {
    clearTimeout(timeout);
    reader.releaseLock();
  }
}
