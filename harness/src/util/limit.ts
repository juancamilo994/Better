// Runs async tasks with at most `limit` in flight and returns results in input order.
export async function mapLimited<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  });
  await Promise.all(workers);
  return out;
}

export const judgeConcurrency = () => {
  const n = Number(process.env.BETTER_JUDGE_CONCURRENCY ?? 6);
  return Number.isInteger(n) && n >= 1 && n <= 16 ? n : 6;
};
