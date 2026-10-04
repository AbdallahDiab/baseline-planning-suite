import { serve } from '@hono/node-server';
import { createApp } from './app';
import { JsonStore } from './store/json-store';

const port = readPort(process.env.PORT ?? '3000');
const dataFile = process.env.DATA_FILE ?? 'data/baseline-store.json';
const store = await JsonStore.open({
  dataFile,
  seedFile: process.env.SEED_FILE,
});
const app = createApp({ store });

serve(
  {
    fetch: app.fetch,
    hostname: '0.0.0.0',
    port,
  },
  (info) => {
    console.log(`API listening on ${info.address}:${info.port}`);
  },
);

function readPort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT: ${value}`);
  }
  return port;
}
