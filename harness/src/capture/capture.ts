import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createServer } from 'node:net';
import type { Artifact, Capture, Project, Viewport } from '../domain.ts';
import { hash } from '../config.ts';
import { publicGet, publicTarget } from './network.ts';
import { DEMO_URL, demoPage, type DemoVersion } from './demo.ts';
import { measure } from './measure.ts';

export const VIEWPORTS = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } } as const;
const blankFacts = () => ({ scrollWidth: 0, clientWidth: 0, elements: [], text: '', title: '', truncated: false });

// Same design, different clock: a fingerprint of layout, type and color with
// digits masked and positions rounded, so live counters and timestamps do not
// make an unchanged page look new. Raw contentHash still records exact bytes.
// One vague message for 404s, blocked redirects and bot walls left users unable
// to act. Each case now says what happened; every message keeps the known prefix.
export function navigationFailure(status: number | null, blocked: string | null) {
  const base = 'Navigation did not return a successful page';
  if (blocked && /private|local|reserved|metadata/i.test(blocked)) return `${base}: it redirected to a private or internal address, which Better never loads. Use a public URL.`;
  if (blocked) return `${base}: the request was blocked (${blocked.replace(/\.$/, '')}).`;
  if (status === null) return `${base}: the site did not respond.`;
  if (status === 404 || status === 410) return `${base}: the site returned HTTP ${status} (page not found). Check the URL.`;
  if ([401, 403, 407].includes(status)) return `${base}: the site refused access (HTTP ${status}). Pages behind a login or bot protection can't be scored.`;
  if (status === 429) return `${base}: the site rate-limited or challenged the request (HTTP 429), usually bot protection. Try again later.`;
  if (status >= 500) return `${base}: the site returned a server error (HTTP ${status}). Try again later.`;
  return `${base}: the site returned HTTP ${status}.`;
}

export function layoutFingerprint(snapshot: { title: string; elements: { tag: string; text: string; fontSize: number; color: string; background: string; width: number; height: number; x: number; y: number }[] }) {
  const r = (n: number) => Math.round(n / 8) * 8;
  const mask = (t: string) => t.replace(/\d/g, '#');
  return hash(JSON.stringify({ title: mask(snapshot.title), elements: snapshot.elements.map(e => [e.tag, mask(e.text), e.fontSize, e.color, e.background, r(e.width), r(e.height), r(e.x), r(e.y)]) }));
}

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
      // Subresource problems degrade a capture instead of voiding it: real sites
      // routinely carry 404s, beacons and analytics. Each is counted and disclosed.
      let blockedRequests = 0;
      let failedResources = 0;
      let totalBytes = 0;
      let requests = 0;
      let documentHash = '';
      let mainDocumentBlocked: string | null = null;
      await context.routeWebSocket('**/*', route => { blockedRequests++; route.close(); });
      await context.route('**/*', async route => {
        try {
          if (route.request().method() !== 'GET' || ++requests > 600) throw new Error('Request blocked.');
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
          if (response.status >= 400) failedResources++;
          await route.fulfill(response);
        } catch (error) {
          if (route.request().isNavigationRequest() && !route.request().frame().parentFrame()) mainDocumentBlocked = error instanceof Error ? error.message : 'blocked';
          blockedRequests++;
          await route.abort('blockedbyclient').catch(() => {});
        }
      });
      const page = await context.newPage();
      // Uncaught script errors during load feed the Layer 3 script-error gate.
      let pageErrors = 0;
      page.on('pageerror', () => { pageErrors++; });
      page.setDefaultTimeout(12_000);
      page.on('dialog', dialog => { void dialog.dismiss(); });
      context.on('page', popup => { if (popup !== page) void popup.close(); });
      const capturedAt = new Date().toISOString();
      try {
        const response = await page.goto(project.url, { waitUntil: 'load', timeout: 25_000 }).catch(error => { if (mainDocumentBlocked) return null; throw error; });
        // Sites that poll never reach network idle; wait a bounded time, then proceed.
        const networkIdle = await page.waitForLoadState('networkidle', { timeout: 8_000 }).then(() => true, () => false);
        if (!response?.ok()) throw new Error(navigationFailure(response?.status() ?? null, mainDocumentBlocked));
        if (!response.headers()['content-type']?.includes('text/html')) throw new Error('Capture requires an HTML page.');
        await page.evaluate(async () => {
          document.querySelectorAll('img').forEach(img => { img.loading = 'eager'; });
          await document.fonts.ready;
          // One undecodable image must not void the capture; it stays visible as broken.
          await Promise.allSettled(Array.from(document.images).map(img => img.decode()));
        });
        if (expectedText && !(await page.locator('body').innerText()).includes(expectedText)) throw new Error('Expected page marker is missing.');
        // Entrance animations often start invisible. Let script-driven reveals
        // start, then jump finite animations to their end state before freezing,
        // so the capture shows content at rest rather than a mid-animation blank.
        await page.waitForTimeout(1_500);
        await page.evaluate(() => { for (const animation of document.getAnimations()) { try { if (Number.isFinite(animation.effect?.getComputedTiming().endTime ?? Infinity)) animation.finish(); } catch { /* infinite or detached: paused below */ } } });
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
          const brokenImages = Array.from(document.images).filter(img => img.checkVisibility() && (!img.getAttribute('src')?.trim() && !img.srcset || (img.complete && img.naturalWidth === 0))).length;
          const headingLevels = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).filter(h => h.checkVisibility()).map(h => Number(h.tagName[1]));
          const controls = Array.from(document.querySelectorAll('button,[role=button],input[type=submit],input[type=button]')).filter(el => el.checkVisibility()).slice(0, 200).map(el => ((el as HTMLInputElement).value && el.tagName === 'INPUT' ? (el as HTMLInputElement).value : el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 80) || (el.getAttribute('aria-label') ?? '').trim());
          return { brokenImages, headingLevels, controls, html: document.documentElement.outerHTML, height: document.documentElement.scrollHeight, scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, elements, text: document.body.innerText, title: document.title, truncated: visible.length > 1200 };
        });
        if (!snapshot.text.trim() || snapshot.scrollWidth > 12_000 || snapshot.html.length > 4_000_000) throw new Error('Empty page or capture size limit exceeded.');
        // Long pages keep their first 12,000px of full-page evidence; the clip is disclosed.
        const fullPageClipped = snapshot.height > 12_000;
        const screenshot = await page.screenshot({ fullPage: false, type: 'png', caret: 'initial', timeout: 12_000 });
        const fullScreenshot = await page.screenshot({ fullPage: true, type: 'png', caret: 'initial', timeout: 12_000, ...(fullPageClipped ? { clip: { x: 0, y: 0, width: size.width, height: 12_000 } } : {}) });
        const finalHtml = await page.evaluate(() => document.documentElement.outerHTML);
        if (finalHtml !== snapshot.html) throw new Error('Page changed during capture.');
        // axe-core needs the event loop: re-enable scripts only after all evidence
        // above is saved, and bound the engine run so a page cannot stall capture.
        await session.send('Emulation.setScriptExecutionDisabled', { value: false });
        const measurements = await measure(page, viewport);
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
        await save('measurements', Buffer.from(JSON.stringify(measurements, null, 2)), 'measurements.json');
        const facts = { scrollWidth: snapshot.scrollWidth, clientWidth: snapshot.clientWidth, elements: snapshot.elements, text: snapshot.text, title: snapshot.title, truncated: snapshot.truncated, brokenImages: snapshot.brokenImages, headingLevels: snapshot.headingLevels, controls: snapshot.controls };
        captures.push({ viewport, ...size, status: 'ready', url: page.url(), capturedAt, state: 'default-frozen', artifacts, facts, browser: browser.version(), contentHash: hash(snapshot.html + hash(screenshot)), layoutHash: layoutFingerprint(snapshot), documentHash, blockedRequests, failedResources, networkIdle, fullPageClipped, measurements, pageErrors });
      } catch (error) {
        const known = error instanceof Error && ['Navigation did not', 'Capture requires', 'Expected page', 'Empty page', 'Page changed'].some(prefix => error.message.startsWith(prefix));
        captures.push({ viewport, ...size, status: 'failed', reason: known ? (error as Error).message : 'Capture failed or readiness timed out. No design verdict was produced.', url: project.url, capturedAt, state: 'default-frozen', artifacts: [], facts: blankFacts(), browser: browser.version(), contentHash: '', documentHash, blockedRequests });
      } finally { await context.close(); }
    }
    return captures;
  } finally {
    await browser?.close();
    await new Promise<void>(resolve => denyProxy.close(() => resolve()));
  }
}
