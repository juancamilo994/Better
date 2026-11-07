import AxeBuilder from '@axe-core/playwright';
import type { Page } from 'playwright';
import type { MeasuredNode, Measurements, Viewport } from '../domain.ts';

export const REFLOW_WIDTH = 320;
const NODE_LIMIT = 200;
const outcomes = { violations: 'fail', passes: 'pass', incomplete: 'unknown' } as const;

// Deterministic measurements of the frozen page. axe-core samples real
// composited colors and reports "incomplete" when it cannot (images, gradients),
// which stays unknown. A failed engine run leaves every measurement unknown.
export async function measure(page: Page, viewport: Viewport): Promise<Measurements> {
  const measurements: Measurements = { engine: null, contrast: [], targetSize: [], spacing: {}, reflow320: null };
  try {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const result = await Promise.race([
      // Legacy mode runs in-page; the default opens a helper page that the capture popup guard closes.
      new AxeBuilder({ page }).withRules(['color-contrast', 'target-size']).setLegacyMode(true).analyze(),
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('axe timed out')), 20_000); }),
    ]).finally(() => clearTimeout(timer));
    measurements.engine = `axe-core ${result.testEngine.version}`;
    for (const [key, outcome] of Object.entries(outcomes)) {
      for (const rule of result[key as keyof typeof outcomes]) {
        const list = rule.id === 'color-contrast' ? measurements.contrast : rule.id === 'target-size' ? measurements.targetSize : null;
        for (const node of rule.nodes) {
          if (!list || list.length >= NODE_LIMIT * 3) continue;
          const data = (node.any[0]?.data ?? {}) as { contrastRatio?: number; expectedContrastRatio?: string };
          const entry: MeasuredNode = { outcome, target: node.target.join(' ').slice(0, 200) };
          if (typeof data.contrastRatio === 'number') entry.ratio = data.contrastRatio;
          if (data.expectedContrastRatio) entry.expected = parseFloat(data.expectedContrastRatio);
          list.push(entry);
        }
      }
    }
  } catch { /* Engine unavailable or page rejected injection: measurements stay unknown. */ }
  measurements.spacing = await page.evaluate(() => {
    const counts: Record<string, number> = {};
    const properties = ['margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'row-gap', 'column-gap'];
    for (const el of Array.from(document.body.querySelectorAll('*')).slice(0, 4000)) {
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      const style = getComputedStyle(el);
      for (const property of properties) {
        const value = parseFloat(style.getPropertyValue(property));
        if (value > 0) { const key = String(Math.round(value * 2) / 2); counts[key] = (counts[key] ?? 0) + 1; }
      }
    }
    return counts;
  });
  if (viewport === 'mobile') {
    // Scripts are frozen, so this measures CSS reflow only, not script-driven layout.
    await page.setViewportSize({ width: REFLOW_WIDTH, height: 844 });
    measurements.reflow320 = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  }
  return measurements;
}
