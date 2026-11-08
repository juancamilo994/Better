# Score orb prototype

Standalone playground for the 3D score orb that ships as `apps/web/src/components/orb`.
Use it to tune the look (shape math, materials, glow) with sliders and presets before
porting changes into the app engine.

```bash
python3 prototypes/score-orb/serve.py 4173
```

Then open http://localhost:4173. `serve.py` serves the page and proxies read-only
`GET /api/*` to the local harness on :3000, so the run picker can load real runs.
Without the harness, presets and sliders still work.

Shape: each rubric axis owns a region of a sphere. Radius = 1 + liquid ripple + lumps
+ creased ridges + thorns, each gated by that region's lost points. Unassessed axes
show a grid instead of a guessed shape; a verified deal-breaker failure draws glowing
cracks (warning only, the score is unchanged).
