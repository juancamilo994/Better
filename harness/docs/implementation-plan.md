# Better baseline

Source: [Elle's evolving rubric and product loop](https://docs.google.com/document/d/1VkiRkItqodwaRDXBmgIiAGksxbDnHvUC5qD4TztoNgM/edit), read in full November 7, 2026, including sections 14–16 and both open comments. The document is unchanged. Eight axes and 1–4 anchors are provisional. Elle's microcopy comment means removing redundant explanation, not removing useful labels, errors, or instructions. Typography presentation/message separation remains open; editable criteria do not claim her approval.

## Finish line

Current scope: user narrowed work to the evaluation harness. Deliver API, CLI demo, capture, judges, persistence, comparison and handoff assembly. Product UI, radar rendering and visual polish are deferred; expose chart-ready axes/history for the future UI.

One designer creates a persistent project from a public URL, captures desktop/mobile evidence, reviews independently labeled measured and fixture results, selects fixes, copies one prompt, and reruns the same project. Saved runs, selections and prompts survive restart. Changed contracts are incomparable. No automatic implementation or delivery. No paid model calls or billing changes during this build.

## Implementation

1. Express + TypeScript, a small native browser UI, SQLite and disk artifacts. No existing app stack/deployment was present. Single local operator, loopback only; no authentication or hosted deployment in this baseline.
2. Capture with Playwright through a DNS-pinned, public-address-only GET relay. Every redirect/resource is checked. Block service workers, WebSockets, writes and forms; freeze page state before matched screenshot/DOM/style/text extraction. A built-in controlled page uses synthetic request fulfillment, never a private-network exception.
3. Separate capture, exact checks, provider-independent judge, template explanations, aggregation, and persistence. Real SubQ adapter uses documented bounded choices. Fixture decisions are explicit; unsupported criteria abstain. Version/hash full rubric/profile/judge/capture contracts.
4. Exercise built HTTP API and controlled two-version page with fixture judgments, inspect screenshots, test failures and persistence, lint/build. Push feature branch and draft PR; no merge or deployment.

## UI contract

Greenfield, build scope. Routes `/` and `/#project-id`; live evidence target. Objects: project → immutable evaluation runs → evidence/results/suggestions → append-only selections/prompts/corrections. Primary jobs: capture, choose handoff, return and compare. Empty, capturing, failed, setup-needed, incomplete, fixture and incompatible states are explicit.

Design: a designer's review desk; saved website image and eight-axis radar are the focus. Cool white (#f6f8fb), ink (#192a3a), blue (#2459a9), pale blue (#e8effa), amber (#8a5011), gray (#667382). System sans for interface, Georgia for the brief headline; 4/8px spacing, 6px controls, quiet separators. No decorative animation. Native forms/tables/details/SVG; no external reference assets. Keyboard focus, 44px controls, 360/400px layouts and reduced motion. Captured HTML is downloadable text, never executed in Better.

## Boundaries

Fixture judgments are sample data and cannot establish model accuracy or improvement. Deterministic facts remain measured and separate. Static capture cannot establish motion, interactions, accessibility compliance, original source or business trustworthiness. References, runtime/motion verifiers and human calibration remain explicit extension points. Human corrections are append-only annotations, never score edits. Source inspector stays not connected. Profile/rubric JSON are editable and snapshotted; changed hashes prevent comparison even if a version label is reused.
