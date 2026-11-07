import { lookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import ipaddr from 'ipaddr.js';
import { AppError } from '../domain.ts';

export function publicUrl(input: string): URL {
  let url: URL;
  try { url = new URL(input); } catch { throw new AppError('Enter an absolute public http or https URL.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash ||
      (url.port && !['80', '443'].includes(url.port))) {
    throw new AppError('Capture requires http(s), standard ports, no credentials or fragment.');
  }
  return url;
}

export function isPublicAddress(address: string): boolean {
  try {
    // ipaddr.process converts IPv4-mapped IPv6 before range classification.
    const ip = ipaddr.process(address);
    return ip.range() === 'unicast';
  } catch { return false; }
}

export type Resolver = (host: string) => Promise<{ address: string; family: number }[]>;
const resolveHost: Resolver = host => lookup(host, { all: true, verbatim: true });
export async function publicTarget(input: string, resolver: Resolver = resolveHost) {
  const url = publicUrl(input);
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new AppError('DNS resolution timed out.')), 5_000); });
  const addresses = await Promise.race([resolver(hostname), timeout]).finally(() => clearTimeout(timer));
  if (!addresses.length || addresses.some(a => !isPublicAddress(a.address))) {
    throw new AppError('Private, local, reserved and metadata destinations are blocked.');
  }
  return { url, address: addresses[0] };
}

// Browser requests never continue onto Chromium's network stack. Each GET uses
// this relay, with the checked IP pinned to the connection (no DNS re-resolution).
// Redirects are returned to Playwright and pass this same guard as new requests.
export async function publicGet(input: string, resolver: Resolver = resolveHost) {
  const { url, address } = await publicTarget(input, resolver);
  return new Promise<{ status: number; headers: Record<string, string>; body: Buffer }>((resolve, reject) => {
    const request = (url.protocol === 'https:' ? https : http).request(url, {
      method: 'GET', agent: false, timeout: 12_000, family: address.family,
      headers: { 'User-Agent': 'BetterCapture/0.1', 'Accept-Encoding': 'identity', Accept: '*/*' },
      lookup: (_host, _options, callback) => callback(null, address.address, address.family),
    }, response => {
      const chunks: Buffer[] = [];
      let bytes = 0;
      response.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 8 * 1024 * 1024) response.destroy(new Error('Resource too large.'));
        else chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => {
        const headers: Record<string, string> = {};
        for (const [key, value] of Object.entries(response.headers)) {
          // Do not persist or forward cookies, authentication or hop-by-hop headers.
          if (value && ['content-type', 'content-encoding', 'location'].includes(key)) headers[key] = String(value);
        }
        resolve({ status: response.statusCode ?? 502, headers, body: Buffer.concat(chunks) });
      });
    });
    request.on('error', reject);
    request.on('timeout', () => request.destroy(new Error('Resource timed out.')));
    // Absolute deadline also stops a peer that keeps sending tiny chunks.
    const deadline = setTimeout(() => request.destroy(new Error('Resource deadline exceeded.')), 12_000);
    request.on('close', () => clearTimeout(deadline));
    request.end();
  });
}
