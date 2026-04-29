# gisgap-uav-structure

Interactive multi-modal pipeline visualizer for UAV-based structural defect inspection on bridges and viaducts. Walks through the full perception → fusion → defect head → predictive maintenance → edge-deployment chain on a single bridge scene, with each sensor modality (RGB, thermal, LiDAR, GPR, acoustic) toggleable as its own map layer and traceable back to its pipeline stage.

Live demo: https://daudee215.github.io/gisgap-uav-structure/

Owner: Daud Tasleem
Created: 2026-04-29
License: MIT

---

## 1. What this tool computes

Given a bridge or viaduct geometry and a set of UAV inspection runs across multiple sensor modalities, the tool produces a single navigable scene that:

- Renders each modality as a registered, toggleable spatial layer over the structure
- Attributes every layer to the pipeline stage that produced it (per-modality feature extractor, cross-modal fusion, defect head, temporal model)
- Surfaces detected defects as point/polygon overlays with type, severity, and the modalities that contributed to the detection
- Exposes the multi-modal evidence behind any individual defect, so a reviewer can audit which sensor saw what and which fusion stage assigned the label
- Shows the UAV trajectory and per-segment sensor footprints so coverage gaps are visible at a glance

The output is a single self-contained HTML page. No backend, no server-side state. The bundled scene is synthetic but topologically and geometrically faithful to a real Eindhoven structure (Hovenring); it is intended as a pipeline visualizer, not a working detector.

---

## 2. Why this exists

Multi-modal UAV inspection of transportation infrastructure is moving from research prototypes into procurement. Reviewers, asset owners, and PhD committees increasingly need to see how the pipeline thinks, not just its top-line accuracy:

1. Per-modality feature pipelines are typically buried in code. There is no widely used artifact for showing what each sensor contributes spatially, on the structure, in one view.
2. Cross-modal fusion architectures (attention-based, transformer fusion, cross-modal representation learning) hide the question "which modality drove this detection?" behind a single softmax. That is not auditable for safety-critical inspection.
3. Predictive maintenance and remaining-useful-life (RUL) outputs are usually presented as time series detached from the geometry of the structure they describe.
4. Edge-deployment constraints (model compression, inference budget per UAV pass) are rarely visualized alongside the analytical pipeline.

This tool collapses those four concerns into one scene so the pipeline is inspectable end to end.

---

## 3. Alignment with the TU/e STRUCTURE PhD position

This tool was built to align with the PhD position "Multi-modal AI for UAV-based structural defect analysis", AIMS lab, Signal Processing Systems group, Department of Electrical Engineering, TU/e, within the international STRUCTURE project.

The position calls out a specific stack of methods. This tool maps them as follows.

| Position requirement | Tool element |
|---|---|
| Heterogeneous sensor fusion (RGB, thermal, LiDAR, acoustic, GPR, X-ray) | Six toggleable modality layers per scene; each layer carries its own pipeline-stage attribution |
| Attention-based fusion architectures | The fusion stage in the pipeline diagram is a cross-modal attention block; defect tooltips show per-modality attention weights |
| Vision Language Models / multi-modal AI | Per-defect evidence panel uses a templated VLM-style description ("RGB shows transverse crack, thermal shows associated thermal gradient, LiDAR shows depth discontinuity") |
| Detection of cracks, voids, delamination, corrosion, internal discontinuities | Defect markers carry these classes; GPR cross-section panel shows subsurface void/delamination signatures |
| Temporal modelling, RUL forecasting | Predictive-maintenance stage in the pipeline diagram; per-defect panel includes a synthetic risk progression curve |
| Edge deployment on UAV-mounted processors | Edge-inference stage in the pipeline diagram with per-stage compute-budget annotation (latency, params) |
| Real-world validation on operational bridges and viaducts | Scene is anchored on the Hovenring in Eindhoven, with realistic UAV trajectory and sensor footprints |

The tool is not a drop-in replacement for any STRUCTURE project deliverable. It is a visualization scaffold that demonstrates how the analytical pipeline is intended to be presented to reviewers, asset owners, and downstream maintenance planners.

---

## 4. Pipeline architecture

```
                           ┌────────────────────────────────────────────────┐
                           │            UAV inspection pass                 │
                           │   trajectory, sensor footprints, timestamps    │
                           └────────────┬───────────────────────────────────┘
                                        │
        ┌──────────────┬────────────────┼────────────────┬──────────────┬──────────────┐
        │              │                │                │              │              │
   ┌────▼────┐    ┌────▼────┐      ┌────▼────┐      ┌────▼────┐    ┌────▼────┐    ┌────▼────┐
   │   RGB   │    │ Thermal │      │  LiDAR  │      │   GPR   │    │ Acoustic│    │ X-ray   │
   │  ortho  │    │  field  │      │  depth  │      │ b-scan  │    │  array  │    │ backsc. │
   └────┬────┘    └────┬────┘      └────┬────┘      └────┬────┘    └────┬────┘    └────┬────┘
        │              │                │                │              │              │
   ┌────▼────┐    ┌────▼────┐      ┌────▼────┐      ┌────▼────┐    ┌────▼────┐    ┌────▼────┐
   │ ViT/    │    │ ResNet  │      │ Sparse  │      │ Hyper-  │    │ Spec-   │    │ Conv    │
   │ DINOv2  │    │ FT      │      │ Conv 3D │      │ bola    │    │ trogram │    │ encoder │
   │ feats   │    │ feats   │      │ + Point │      │ detect  │    │ CNN     │    │         │
   │         │    │         │      │ Net++   │      │ + CFAR  │    │ + CRNN  │    │         │
   └────┬────┘    └────┬────┘      └────┬────┘      └────┬────┘    └────┬────┘    └────┬────┘
        └──────────────┴────────────────┼────────────────┴──────────────┴──────────────┘
                                        │
                              ┌─────────▼─────────┐
                              │ Cross-modal       │
                              │ attention fusion  │
                              │ (token-level,     │
                              │  geometry-aware)  │
                              └─────────┬─────────┘
                                        │
              ┌─────────────────────────┼─────────────────────────┐
              │                         │                         │
       ┌──────▼──────┐          ┌───────▼───────┐         ┌───────▼───────┐
       │ Defect head │          │ Temporal /    │         │ VLM caption   │
       │  type       │          │ RUL model     │         │ + retrieval   │
       │  severity   │          │  risk curve   │         │  cross-modal  │
       │  geometry   │          │  remaining    │         │  reasoning    │
       │             │          │  useful life  │         │               │
       └──────┬──────┘          └───────┬───────┘         └───────┬───────┘
              │                         │                         │
              └─────────────────────────┼─────────────────────────┘
                                        │
                              ┌─────────▼─────────┐
                              │ Edge inference    │
                              │ on UAV processor  │
                              │ (quantized,       │
                              │  pruned, latency  │
                              │  budgeted)        │
                              └───────────────────┘
```

A higher-resolution diagram is at `docs/architecture.svg`. The detailed methodology notes per stage are at `docs/pipeline.md`.

---

## 5. Repository layout

```
gisgap-uav-structure/
  README.md                  This file
  LICENSE                    MIT
  ADR-001-architecture.md    Architecture decision record
  index.html                 Single-page interactive demo
  assets/
    style.css                Layout + theming
    app.js                   Map, layers, sidebar, defect panel
    data.js                  Bridge geometry, flight path, defects, modality metadata
  docs/
    pipeline.md              Per-stage methodology notes
    architecture.svg         Pipeline diagram
  geobrief-card.html         Snippet to paste into the gisgap hub index
  .github/
    workflows/
      deploy.yml             Sync built site to daudee215.github.io/gisgap-uav-structure/
```

---

## 6. How to run locally

This is a static page. Any static server works.

```bash
cd gisgap-uav-structure
python -m http.server 8000
# open http://localhost:8000/
```

No build step, no install. MapLibre GL JS is loaded from CDN.

---

## 7. How to extend

The tool is intentionally factored so that swapping in real data is a single file change.

- To swap the bridge: edit `BRIDGE_CENTER`, `BRIDGE_OUTLINE_PARAMS`, and `MAP_BOUNDS` in `assets/data.js`.
- To swap the defects: replace the `DEFECTS` array in `assets/data.js`. Each entry carries `id`, `coords`, `type`, `severity`, `modality_evidence`, and `risk_curve`.
- To swap a modality's spatial layer: replace the synthetic generator under `MODALITIES.<key>.geometry_generator` with a function that returns GeoJSON. The pipeline-stage attribution comes from `MODALITIES.<key>.pipeline_stage`.
- To wire a real fusion model: the cross-modal attention weights shown in the defect panel come from `defect.modality_evidence[i].attention`. Replace with model output.
- To add X-ray backscatter as a seventh modality: add a new entry to `MODALITIES` and a new layer registration in `app.js`. Layout is grid-based and absorbs new toggles without changes elsewhere.

---

## 8. Honest limitations

- All sensor data in this scene is synthetic. The bridge geometry and georeferencing are real.
- Per-modality "feature extractors" are not running. The layers are illustrative spatial proxies for what each extractor would output, registered to the structure.
- The fusion attention weights in the defect panel are hand-tuned to be plausible, not learned.
- The RUL curve is a parameterized exponential decay seeded per defect, not a trained temporal model.
- The page does not depend on any sensor SDK, ROS bag reader, or training pipeline. Adding those is straightforward (see Section 7) but out of scope here.

---

## 9. References

The methodology section in `docs/pipeline.md` cites the specific paper families this pipeline draws from (DINOv2, PointNet++, sparse 3D conv, cross-modal attention, GPR hyperbola detection, CRNN for acoustic emission, RUL via temporal CNNs and Bayesian state-space models). The ADR records the rejected alternatives and why.

---

## 10. Contact

Daud Tasleem — daudtasleem215@gmail.com
GitHub: https://github.com/daudee215
