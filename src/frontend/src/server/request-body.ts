// Bound aggregate tRPC bodies before its JSON adapter buffers or parses them.
// Unrelated procedures retain the small limit even when callers use batch syntax.
export async function protectTrpcBody(request: Request): Promise<Request | Response> {
  if (!request.body) return request;
  const procedures = new URL(request.url).pathname.slice('/api/trpc/'.length).split(',');
  const maximum = procedures.includes('calendar.saveDoor') ? 14_000_000 : 131_072;
  if (Number(request.headers.get('content-length')) > maximum) {
    void request.body.cancel();
    return uploadTooLarge();
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    request.signal.throwIfAborted();
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maximum) {
      void reader.cancel();
      return uploadTooLarge();
    }
    chunks.push(value);
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Request(request, { body: body.buffer });
}

function uploadTooLarge() {
  return Response.json(
    {
      error: {
        message: 'PAYLOAD_TOO_LARGE',
        code: -32013,
        data: {
          code: 'PAYLOAD_TOO_LARGE',
          httpStatus: 413,
          fieldErrors: { imageData: ['Invalid'] },
        },
      },
    },
    { status: 413, headers: { 'Cache-Control': 'no-store' } },
  );
}
