import test from 'node:test';
import assert from 'node:assert/strict';
import { publicUrl, publicTarget, isPublicAddress } from '../src/capture/network.ts';

test('public-only address classification covers local, metadata, reserved and IPv6 forms', () => {
  for (const address of ['127.0.0.1','0.0.0.0','10.0.0.1','172.16.0.1','192.168.1.1','169.254.169.254','100.100.100.200','100.64.0.1','224.0.0.1','192.0.2.1','198.18.0.1','::1','::','fc00::1','fe80::1','::ffff:127.0.0.1','2001:db8::1','64:ff9b::7f00:1']) assert.equal(isPublicAddress(address), false, address);
  assert.equal(isPublicAddress('93.184.216.34'), true); assert.equal(isPublicAddress('2606:4700::1111'), true);
});
test('URL parser rejects unsupported protocols, credentials, fragments and nonstandard ports', () => {
  for (const url of ['file:///etc/passwd','ftp://example.com','https://user:pass@example.com','http://example.com:8080','https://example.com/#secret']) assert.throws(() => publicUrl(url));
  assert.equal(publicUrl('https://example.com/path').hostname, 'example.com');
});
test('all DNS answers must be public; normalized literal and redirect targets use the same gate', async () => {
  const publicResolver = async () => [{ address: '93.184.216.34', family: 4 }];
  assert.equal((await publicTarget('https://example.com/', publicResolver)).address.address, '93.184.216.34');
  await assert.rejects(publicTarget('https://example.com/', async () => [{ address: '93.184.216.34', family: 4 }, { address: '127.0.0.1', family: 4 }]));
  for (const url of ['http://127.1/','http://2130706433/','http://[::ffff:127.0.0.1]/','http://169.254.169.254/']) {
    await assert.rejects(publicTarget(url, async host => [{ address: host, family: host.includes(':') ? 6 : 4 }]));
  }
});
