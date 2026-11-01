import { spawn } from 'node:child_process';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, stat, rename, unlink, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/** Optional server conversion for older TVs that reject SoundCloud's fragmented-MP4 HLS. */
export function convertToMp3(url, output) {
  return new Promise((resolve, reject) => {
    const args = ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y'];
    if (process.env.HTTPS_PROXY) args.push('-http_proxy', process.env.HTTPS_PROXY);
    args.push('-tls_verify', '1');
    const ca = process.env.SOUNDCLOUD_CA_FILE || '/etc/ssl/certs/ca-certificates.crt';
    if (existsSync(ca)) args.push('-ca_file', ca);
    args.push('-i', url, '-vn', '-c:a', 'libmp3lame', '-b:a', '128k', '-fs', '67108864', '-f', 'mp3', output);
    const child = spawn(process.env.FFMPEG || 'ffmpeg', args, { stdio: ['ignore', 'ignore', 'ignore'] });
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Compatible audio conversion timed out. Try another track.')); }, 60000);
    child.on('error', () => { clearTimeout(timer); reject(new Error('Install FFmpeg on the music helper to use compatible SoundCloud audio.')); });
    child.on('close', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error('The music helper could not convert this public stream.')); });
  });
}

export function compatibleSoundCloud(source, { cacheDir = process.env.SOUNDCLOUD_CACHE_DIR || join(tmpdir(), 'bitchord-soundcloud-mp3'), convert = convertToMp3 } = {}) {
  const pending = new Map();
  function valid(id) { if (!/^\d{1,30}$/.test(String(id))) throw new Error('Invalid SoundCloud track id'); return String(id); }
  async function ensure(id) {
    id = valid(id); const file = join(cacheDir, id + '.mp3');
    try { const info = await stat(file); if (info.size && Date.now() - info.mtimeMs < 30 * 60000) return file; } catch {}
    if (pending.has(id)) return pending.get(id);
    const task = (async () => {
      await mkdir(cacheDir, { recursive: true, mode: 0o700 });
      // Bound the regenerable cache to roughly 128 MiB, keeping the newest files.
      const files = [];
      for (const name of await readdir(cacheDir)) if (/^\d+\.mp3$/.test(name)) {
        const path = join(cacheDir, name); try { const info = await stat(path); files.push({ path, size: info.size, at: info.mtimeMs }); } catch {}
      }
      files.sort((a, b) => b.at - a.at); let bytes = 0;
      for (const entry of files) { bytes += entry.size; if (bytes > 128 * 1024 * 1024) await unlink(entry.path).catch(() => {}); }
      const stream = await source.stream(id); const temporary = file + '.tmp';
      try { await convert(stream.url, temporary); const info = await stat(temporary); if (!info.size || info.size >= 64 * 1024 * 1024) throw new Error('Compatible audio file exceeded the cache limit.'); await rename(temporary, file); return file; }
      finally { await unlink(temporary).catch(() => {}); }
    })().finally(() => pending.delete(id));
    pending.set(id, task); return task;
  }
  return {
    ...source,
    async stream(id, { origin } = {}) { await ensure(id); return { url: origin + '/soundcloud/audio/' + valid(id), format: 'mp3', manifest: 'none', encrypted: false }; },
    async audio(req, res, id) {
      const file = await ensure(id), { size } = await stat(file); let start = 0, end = size - 1, status = 200;
      if (req.headers.range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
        if (!match || !match[1] && !match[2]) { res.writeHead(416, { 'Content-Range': 'bytes */' + size }); res.end(); return; }
        if (!match[1]) start = Math.max(0, size - Number(match[2]));
        else { start = Number(match[1]); if (match[2]) end = Math.min(size - 1, Number(match[2])); }
        if (start > end || start >= size) { res.writeHead(416, { 'Content-Range': 'bytes */' + size }); res.end(); return; }
        status = 206;
      }
      const headers = { 'Content-Type': 'audio/mpeg', 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' };
      if (status === 206) headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
      res.writeHead(status, headers);
      if (req.method === 'HEAD') { res.end(); return; }
      const reader = createReadStream(file, { start, end }); reader.on('error', () => res.destroy()); res.on('close', () => reader.destroy()); reader.pipe(res);
    }
  };
}
