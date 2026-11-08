// Score-globe geometry, ported from Elle's UI base. One value per scored
// unit (0–100); directions are a Fibonacci sphere so any vector length works.
// Unscored units should be passed as 100 (no weakness, no spike).

export type Scores = number[]; // 0–100 per unit

export function globeDirections(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const y = 1 - (2 * (index + 0.5)) / count;
    const angle = index * Math.PI * (3 - Math.sqrt(5));
    const ring = Math.sqrt(1 - y * y);
    return [Math.cos(angle) * ring, y, Math.sin(angle) * ring] as const;
  });
}

export function globeRadius(
  x: number,
  y: number,
  z: number,
  scores: Scores,
  directions: readonly (readonly [number, number, number])[],
) {
  let spikes = 0;
  let deficit = 0;
  for (let i = 0; i < directions.length; i++) {
    const direction = directions[i];
    if (!direction) continue;
    const weakness = 1 - Math.max(0, Math.min(100, scores[i] ?? 100)) / 100;
    const dot = x * direction[0] + y * direction[1] + z * direction[2];
    spikes += weakness * Math.exp(-Math.max(0, 1 - dot) * 38);
    deficit += weakness / directions.length;
  }
  const facets = Math.pow(Math.abs(Math.sin(x * 13) * Math.sin(y * 13) * Math.sin(z * 13)), 4);
  return 1 + spikes * 0.95 + facets * deficit * 0.18;
}
