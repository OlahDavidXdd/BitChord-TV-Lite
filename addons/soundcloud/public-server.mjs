import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createServer } from './server.mjs';
const require = createRequire(import.meta.url);
const { create } = require('../../shared/soundcloud-public.cjs');
const bootstrap = JSON.parse(readFileSync(new URL('../../shared/soundcloud-bootstrap.json', import.meta.url)));
const client = create({ ...bootstrap, request: async url => {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw Object.assign(new Error('SoundCloud request failed (' + response.status + ')'), { status: response.status });
  return response.text();
} });
createServer(client).listen(Number(process.env.PORT || 8787), process.env.HOST || '127.0.0.1', () => console.log('Free public SoundCloud helper listening; no OAuth credentials required'));
