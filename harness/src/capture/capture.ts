import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createServer } from 'node:net';
import type { Artifact, Capture, Project, Viewport } from '../domain.ts';
import { hash } from '../config.ts';
import { publicGet, publicTarget } from './network.ts';
import { DEMO_URL, demoPage, type DemoVersion } from './demo.ts';

export const VIEWPORTS = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } } as const;
const blankFacts = () => ({ scrollWidth: 0, clientWidth: 0, elements: [], text: '', title: '', truncated: false });

export async function capturePage(project: Project, runId: string, directory: string, demoVersion: DemoVersion, expectedText?: string): Promise<Capture[]> {
  if (project.source === 'public_url') await publicTarget(project.url);
  await mkdir(directory, { recursive: true });
  // A deny proxy is a backstop for Chromium requests outside route interception.
  // Explicitly remove Chromium's implicit loopback bypass. No capture uses the
  // host's cookies, profile, credentials, or direct browser networking.
  const denyProxy = createServer(socket => socket.destroy());
  await new Promise<void>(resolve => denyProxy.listen(0, '127.0.0.1', resolve));
  const proxyPort = (denyProxy.address() as { port: number }).port;
  let browser;
  try {
    browser = await chromium.launch({ headless: true, chromiumSandbox: true, proxy: { server: `http://127.0.0.1:${proxyPort}`, bypass: '<-loopback>' }, args: ['--disable-quic', '--force-webrtc-ip-handling-policy=disable_non_proxied_udp'] });
    const captures: Capture[] = [];
    for (const [key, size] of Object.entries(VIEWPORTS)) {
      const viewport = key as Viewport;
      const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1, isMobile: viewport === 'mobile', hasTouch: viewport === 'mobile', locale: 'en-US', timezoneId: 'UTC', colorScheme: 'light', reducedMotion: 'reduce', serviceWorkers: 'block', acceptDownloads: false, permissions: [], ignoreHTTPSErrors: false });
      let blockedRequests = 0;
      let resourceFailure = false;
      let totalBytes = 0;
      let requests = 0;
      let documentHash = '';
      await context.routeWebSocket('**/*', route => { blockedRequests++; resourceFailure = true; route.close(); });
      await context.route('**/*', async route => {
        try {
          if (route.request().method() !== 'GET' || ++requests > 160) throw new Error('Request blocked.');
          if (project.source === 'controlled_demo') {
            if (route.request().url() !== DEMO_URL) throw new Error('Demo has no external resources.');
            const body = demoPage(demoVersion);
            documentHash = hash(body);
            await route.fulfill({ status: 200, contentType: 'text/html', body });
            return;
          }
          const response = await publicGet(route.request().url());
          if (route.request().resourceType() === 'document' && !route.request().frame().parentFrame() && response.status >= 200 && response.status < 300) documentHash = hash(response.body);
          totalBytes += response.body.length;
          if (totalBytes > 32 * 1024 * 1024) throw new Error('Capture budget exceeded.');
          if (response.status >= 400) resourceFailure = true;
          await route.fulfill(response);
        } catch {
          blockedRequests++;
          resourceFailure = true;
          await route.abort('blockedbyclient').catch(() => {});
        }
      });
      const page = await context.newPage();
      page.setDefaultTimeout(12_000);
      page.on('dialog', dialog => { void dialog.dismiss(); });
      context.on('page', popup => { if (popup !== page) void popup.close(); });
      const capturedAt = new Date().toISOString();
      try {
        const response = await page.goto(project.url, { waitUntil: 'networkidle', timeout: 25_000 });
        if (!response?.ok()) throw new Error('Navigation did not return a successful page.');
        if (!response.headers()['content-type']?.includes('text/html')) throw new Error('Capture requires an HTML page.');
        await page.evaluate(async () => {
          document.querySelectorAll('img').forEach(img => { img.loading = 'eager'; });
          await document.fonts.ready;
          await Promise.all(Array.from(document.images).map(img => img.decode()));
        });
        if (resourceFailure) throw new Error('A resource was blocked or failed. This capture cannot be graded.');
        if (expectedText && !(await page.locator('body').innerText()).includes(expectedText)) throw new Error('Expected page marker is missing.');
        await page.addStyleTag({ content: '* , *::before, *::after { animation-play-state: paused !important; transition: none !important; caret-color: transparent !important; }' });
        await page.evaluate(() => {
          document.querySelectorAll('video,audio').forEach(el => (el as HTMLMediaElement).pause());
          document.getAnimations().forEach(animation => animation.pause());
          document.querySelectorAll('svg').forEach(svg => svg.pauseAnimations());
          window.scrollTo(0, 0);
        });
        const session = await context.newCDPSession(page);
        await session.send('Emulation.setScriptExecutionDisabled', { value: true });
        // Leave compositor time running: pausing Chromium's virtual clock can
        // stall the second screenshot. Page scripts and animations are frozen.
        const snapshot = await page.evaluate(() => {
          const visible = Array.from(document.querySelectorAll('h1,h2,h3,p,a,button,label,input,textarea,select,img,li')).filter(el => {
            const rect = el.getBoundingClientRect();
            const style = getComputedStyle(el);
            return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && el.checkVisibility({ opacityProperty: true, visibilityProperty: true });
          });
          const elements = visible.slice(0, 1200).map((el, index) => {
            const rect = el.getBoundingClientRect(); const style = getComputedStyle(el);
            return { id: `element-${index}`, tag: el.tagName.toLowerCase(), text: (el.textContent ?? '').trim().slice(0, 160), fontSize: parseFloat(style.fontSize), lineHeight: style.lineHeight, color: style.color, background: style.backgroundColor, width: rect.width, height: rect.height, x: rect.x, y: rect.y, alt: el.getAttribute('alt') };
          });
          return { html: document.documentElement.outerHTML, height: document.documentElement.scrollHeight, scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, elements, text: document.body.innerText, title: document.title, truncated: visible.length > 1200 };
        });
        if (!snapshot.text.trim() || snapshot.height > 12_000 || snapshot.scrollWidth > 12_000 || snapshot.html.length > 4_000_000) throw new Error('Empty page or capture size limit exceeded.');
        const screenshot = await page.screenshot({ fullPage: false, type: 'png', timeout: 12_000 });
        const fullScreenshot = await page.screenshot({ fullPage: true, type: 'png', timeout: 12_000 });
        const finalHtml = await page.evaluate(() => document.documentElement.outerHTML);
        if (finalHtml !== snapshot.html || resourceFailure) throw new Error('Page changed during capture or a resource failed.');
        const artifacts: Artifact[] = [];
        const save = async (kind: Artifact['kind'], bytes: Buffer, extension: string) => {
          const file = `${viewport}.${extension}`;
          await writeFile(join(directory, file), bytes, { flag: 'wx' });
          const dimensions = ['screenshot', 'full_screenshot'].includes(kind) ? { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) } : {};
          artifacts.push({ id: `${runId}:${viewport}:${kind}`, runId, viewport, state: 'default-frozen', kind, file, sha256: hash(bytes), bytes: bytes.length, ...dimensions });
        };
        await save('screenshot', screenshot, 'png');
        await save('full_screenshot', fullScreenshot, 'full.png');
        await save('dom', Buffer.from(snapshot.html), 'html');
        await save('styles', Buffer.from(JSON.stringify(snapshot.elements, null, 2)), 'styles.json');
        await save('text', Buffer.from(snapshot.text), 'txt');
        const facts = { scrollWidth: snapshot.scrollWidth, clientWidth: snapshot.clientWidth, elements: snapshot.elements, text: snapshot.text, title: snapshot.title, truncated: snapshot.truncated };
        captures.push({ viewport, ...size, status: 'ready', url: page.url(), capturedAt, state: 'default-frozen', artifacts, facts, browser: browser.version(), contentHash: hash(snapshot.html + hash(screenshot)), documentHash, blockedRequests });
      } catch (error) {
        const known = error instanceof Error && ['Navigation did not', 'Capture requires', 'A resource was', 'Expected page', 'Empty page', 'Page changed'].some(prefix => error.message.startsWith(prefix));
        captures.push({ viewport, ...size, status: 'failed', reason: known ? (error as Error).message : 'Capture failed or readiness timed out. No design verdict was produced.', url: project.url, capturedAt, state: 'default-frozen', artifacts: [], facts: blankFacts(), browser: browser.version(), contentHash: '', documentHash, blockedRequests });
      } finally { await context.close(); }
    }
    return captures;
  } finally {
    await browser?.close();
    await new Promise<void>(resolve => denyProxy.close(() => resolve()));
  }
}
