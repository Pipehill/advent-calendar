import { defineEventHandler, toWebRequest } from 'h3';
import start from '../dist/server/server.js';

export default defineEventHandler(event => {
  // Carry a disconnected Node caller through Start/tRPC into the backend fetch.
  const controller = new AbortController();
  event.node.res.once('close', () => {
    if (!event.node.res.writableEnded) controller.abort();
  });
  return start.fetch(new Request(toWebRequest(event), { signal: controller.signal }));
});
