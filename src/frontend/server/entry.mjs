import { defineEventHandler } from 'h3';
import start from '../dist/server/server.js';
import { createNodeRequest, sendUploadRejection } from '../src/server/node-request.ts';

export default defineEventHandler(async event => {
  // Carry a disconnected Node caller through Start/tRPC into the backend fetch.
  const controller = new AbortController();
  event.node.res.once('close', () => {
    if (!event.node.res.writableEnded) controller.abort();
  });
  const request = createNodeRequest(event, controller.signal);
  const response = await start.fetch(request);
  if (response.status === 413 && response.headers.get('connection') === 'close') {
    await sendUploadRejection(event.node.req, event.node.res, response, request.body);
    return;
  }
  return response;
});
