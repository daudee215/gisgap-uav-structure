# Pipeline methodology

This document describes the analytical pipeline that the visualizer is structured around. It is written at the level of detail a PhD reviewer expects: each stage names its inputs, its method family, its outputs, and the validation strategy that would be appropriate against operational bridge data.

The visualizer renders synthetic outputs at each stage. The methodology below is what the synthetic outputs stand in for.

---

## Stage 0. Acquisition

Inputs: a UAV inspection plan (waypoints, altitude profile, speed profile, sensor schedule), a target structure (bridge or viaduct geometry, optional BIM/IFC).

The plan is generated against a coverage objective that depends on the target classes: cracks at sub-millimetre scale require RGB ground sample distance below 0.5 mm/px; thermal anomalies tolerate 5 cm/px; LiDAR for surface deformation needs >300 pts/m² on the deck; GPR demands traverses spaced at the depth of interest divided by two; acoustic arrays are stationary or near-stationary captures at structurally informed positions (mid-span, supports, expansion joints).

Outputs: synchronized per-modality streams with per-frame pose (UAV INS + GNSS-RTK, refined post-flight against ground control or SfM bundle adjustment).

Validation: pose reprojection error against ground control points; coverage map per modality before the pipeline is allowed to advance.

---

## Stage 1. Per-modality feature extraction

Each modality is processed by an extractor selected for its signal characteristics. The extractor outputs per-modality dense feature maps registered to the structure surface (or to a structure-relative volumetric grid for subsurface modalities).

### 1.1 RGB ortho

Method family: self-supervised vision transformers (DINOv2 features) for general surface representation, fine-tuned segmentation heads for crack and corrosion classes. SfM/MVS produces the underlying ortho mosaic and a textured mesh.

Output: per-pixel feature embedding + crack/corrosion logits projected onto the structure surface.

Validation: pixel-level IoU against annotated crack masks on a held-out set; calibration check via reliability diagrams.

### 1.2 Thermal

Method family: ResNet/ConvNeXt fine-tuned on radiometric thermal frames, with environmental correction (ambient temperature, solar load history, emissivity priors per material patch from the RGB segmentation).

Output: per-pixel anomaly score + thermal-gradient field projected onto the structure surface.

Validation: AUROC against thermographic ground truth from instrumented panels; ambient-decorrelation check across diurnal captures.

### 1.3 LiDAR

Method family: sparse 3D convolutions (Minkowski) and PointNet++ for per-point features; deformation field computed as point-to-mesh signed distance against a baseline scan; surface reconstruction via Poisson or screened Poisson.

Output: per-point feature embedding, per-point deformation magnitude, surface mesh.

Validation: cross-validation against terrestrial laser scanner reference at selected spans; deformation noise floor quantified against repeated passes.

### 1.4 GPR (ground-penetrating radar)

Method family: classical preprocessing (background removal, gain, time-zero correction), hyperbola detector (Hough or learned) for rebar and void identification, CFAR for delamination signatures. Optional learned migration (deep-learning-aided full-waveform inversion).

Output: subsurface b-scan with annotated reflectors and an estimated permittivity field per traverse.

Validation: against cores and against panels of known rebar layout; depth accuracy reported with permittivity uncertainty.

### 1.5 Acoustic emission / array

Method family: spectrogram CNN + CRNN for transient classification; beamforming on the array for source localization on the structure surface.

Output: time-localized acoustic event catalog with per-event source position, frequency signature, and class probability.

Validation: against pencil-lead-break references at known positions; localization error reported in metres on the structure surface.

### 1.6 X-ray backscatter

Method family: convolutional encoder over backscatter image strips; physics-informed normalisation against source-detector geometry.

Output: per-pixel internal-discontinuity score over the structural element under inspection.

Validation: against panels with engineered internal voids; depth-of-detection limit reported.

---

## Stage 2. Cross-modal attention fusion

All per-modality features are projected into a common geometry-aware token space, where each token carries a 3D position on or under the structure surface and a modality identifier. A transformer fusion block performs cross-modal attention with a positional bias derived from the structure-relative coordinate, so tokens at the same physical point on the bridge are encouraged to attend to each other across modalities.

Two variants are worth differentiating:

- Token-level cross-attention: tokens from all modalities are concatenated; standard multi-head attention, with modality-aware key/query projections.
- Geometry-conditioned attention: attention weights are pre-multiplied by a learned function of token-pair 3D distance, biasing the model toward locally consistent fusion. Empirically more sample-efficient on small inspection corpora.

Output: a fused per-token representation that supports downstream defect classification and VLM-style description.

Validation: ablation per modality (drop one at training and at inference); attention-weight inspection to confirm cross-modal coupling is doing meaningful work and is not collapsed onto a single modality.

---

## Stage 3. Defect head

The fused token representation feeds three heads.

### 3.1 Classification head

Per-token defect class probabilities over: crack (transverse, longitudinal, map), spalling, corrosion, delamination, void, exposed reinforcement, joint-seal failure, drainage failure.

### 3.2 Geometry head

Per-defect polygon on the structure surface (or volumetric extent for subsurface defects). Implemented as a query-based detector (DETR-family) operating on fused tokens, with structure-surface NMS.

### 3.3 VLM description head

A small VLM, conditioned on the fused tokens for a defect region, produces a natural-language description that names the modality evidence and the engineering interpretation. Used as the "evidence statement" in the per-defect panel of the visualizer.

Validation: per-class precision/recall on a held-out bridge inventory; geometry IoU; description faithfulness via reference-checked human review on a sample.

---

## Stage 4. Temporal modelling and remaining useful life

Each defect persists across inspection passes. The temporal model maintains a per-defect state that tracks growth (length, area, depth, severity probability) over time, conditioned on covariates: traffic load history, weather exposure, material profile, prior repair events.

Two variants:

- Temporal CNN over per-defect state sequences for short-horizon classification (worsening / stable / repaired).
- Bayesian state-space model for long-horizon RUL estimation with a calibrated uncertainty band. Useful where action thresholds are policy-set (for example, replace a deck panel when there is an N% probability of severity class "critical" within Y years).

Output: per-defect risk progression curve and an RUL estimate with a confidence interval.

Validation: backtesting on inspection histories with known maintenance events; calibration of the RUL credible interval.

---

## Stage 5. Edge inference on UAV processor

The trained pipeline is compressed for on-UAV inference, with a per-stage compute budget derived from flight duration and battery margin.

Techniques:

- Post-training quantization to INT8 for convolutional and attention layers, with calibration sets sampled from validation footage.
- Structured pruning of attention heads and fusion-block channels with a Lagrangian sparsity term during fine-tuning.
- Knowledge distillation from a high-capacity offline model into a UAV-deployable student.
- Stage-conditional execution: the per-modality extractors run continuously during flight; the fusion and defect head run on regions flagged by a lightweight saliency model, not on every frame, to keep the latency budget realistic.

Output: a deployable model bundle plus a per-stage latency and memory report measured on the target processor (typical targets: NVIDIA Jetson Orin Nano, NXP i.MX 95 with NPU, Hailo-8/15 accelerators).

Validation: end-to-end frame-rate test on the target device with the bundled validation data; comparison of edge predictions against the offline model at the same inputs.

---

## Cross-cutting: data management and provenance

The pipeline only earns its conclusions if the data lineage is traceable. Every per-defect output retains references to the source frames, the per-modality features, the fusion attention map, the model version, and the inspection pass. The visualizer's defect-evidence panel is the human-facing surface of that lineage; the back-end is a per-defect record that points at the artefacts on object storage.

This is the pipeline that the tool's interactive scene is built to make legible.
