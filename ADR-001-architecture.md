# ADR-001: Single-page MapLibre visualizer with synthetic registered sensor layers

Status: Accepted
Date: 2026-04-29
Author: Daud Tasleem

---

## Context

The tool is meant to demonstrate, end to end, the multi-modal UAV structural-inspection pipeline used in the TU/e STRUCTURE project: per-modality feature extraction, cross-modal attention fusion, defect head, temporal/RUL modelling, and edge inference. The artifact has to satisfy three audiences at once: a PhD reviewer who wants to see methodological literacy, an asset owner who wants to see the inspection scene, and a developer who wants to swap in real data without rewriting the page.

Three architectural shapes were considered.

---

## Decision

Build a single-page MapLibre visualizer that renders a real bridge geometry on an OSM basemap, with each sensor modality as a separately toggleable spatial layer attributed to the pipeline stage that produced it. Bundle synthetic but geometrically faithful sensor outputs. Expose a sidebar pipeline diagram that highlights the active modality, and a defect-evidence panel that shows the multi-modal trace behind any single detection.

---

## Alternatives considered

### Alternative A: Architecture diagram only, no map

A rich interactive diagram of the pipeline, with each node clickable to show inputs, outputs, and methods. No spatial scene.

Rejected because:
- Loses the "inspect on the structure" reading. Asset owners and PhD reviewers in transportation infrastructure read evidence on geometry, not on flowcharts.
- Cannot demonstrate registration, coverage, or per-segment sensor footprints, which are first-class concerns in UAV inspection.
- Indistinguishable from a slide; lower technical credibility than a working interactive scene.

### Alternative B: Real ML inference in the browser (ONNX Runtime Web + small model)

Run a quantized model directly in the page on a sample image strip and surface its predictions.

Rejected because:
- A defensible model needs a calibrated multi-modal training set the project does not have. Shipping a model that is wrong on its own bundled data is worse than shipping a clearly-labelled synthetic visualizer.
- Even a small VLM/transformer pushes the page past the "loads on a phone in two seconds" budget that the gisgap shipped-tool standard requires.
- Adds a maintenance surface (model files, runtime updates) that is wholly out of proportion to the page's purpose.

### Alternative C: Per-modality dashboards in separate pages, linked from a hub

One sub-page per sensor modality, plus a fusion sub-page, plus a maintenance sub-page.

Rejected because:
- Defeats the narrative. The whole point is that the modalities are read together against the same structure. Splitting them across pages is the failure mode this tool is supposed to push back against.
- Multiplies the styling and routing surface for no analytical gain.

---

## Consequences

Positive:
- The visualizer is honest about being a visualizer. The README states clearly that data is synthetic and that the page is a pipeline scaffold, not a detector.
- Swap-in points are explicit: a single `MODALITIES` table and a single `DEFECTS` array drive everything. Integration with real outputs is a file-level change.
- The scene reads correctly on first load without interaction. Defaults look obvious (per the user's UI/UX standard).
- The page is static, hostable on GitHub Pages without a build step, and matches the existing gisgap tool conventions.

Negative:
- Reviewers who skim only the live demo and skip the README may misread the synthetic overlays as real sensor outputs. The README, the page footer, and a persistent banner mitigate this.
- The architecture diagram in the sidebar is HTML/SVG, not a real graph layout engine. Adding nodes requires editing the markup, not a JSON config. Acceptable at the current six-modality scope; revisit if the pipeline grows past ten stages.

---

## Verification

- The page loads with the bridge centered, basemap visible, and the fused defect layer + bridge outline + flight path visible by default. A user who interacts with nothing still sees the inspection scene.
- Toggling any modality layer also highlights its corresponding stage in the sidebar pipeline diagram, and vice versa.
- Clicking any defect marker opens an evidence panel that names every modality contributing to the detection, its attention weight, and the GPR/acoustic/thermal signature it carries.
- The page is responsive at 380px viewport width without layout collapse (per the user's mobile-not-optional standard).
