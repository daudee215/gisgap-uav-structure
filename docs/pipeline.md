# Pipeline methodology — v2

This document describes the analytical pipeline that the visualizer is structured around. It is written at the level of detail a PhD reviewer expects: each stage names its inputs, its method family, its outputs, and the validation strategy appropriate against operational bridge data.

The visualizer renders synthetic outputs at each stage. The methodology below is what those synthetic outputs stand in for.

---

## Stage 0. Acquisition

**Inputs:** UAV inspection plan (waypoints, altitude profile, speed profile, sensor schedule), target structure (bridge or viaduct geometry, optional BIM/IFC model).

The plan is generated against a coverage objective that depends on the target defect classes. Cracks at sub-millimetre scale require RGB ground sample distance below 0.5 mm/px, which drives altitude to 10–15 m AGL. Thermal anomalies tolerate 5 cm/px. LiDAR for surface deformation needs >300 pts/m² on the deck face. GPR demands traverses spaced at the depth of interest divided by two (spatial Nyquist); for rebar at 40 mm cover with a 200 MHz antenna, traverse spacing is ≤200 mm. Acoustic arrays are near-stationary captures at structurally informed positions (mid-span, supports, expansion joints, cable anchorages). X-ray backscatter requires slow, low-altitude traversal — the source-detector geometry constrains flight speed to ≤0.5 m/s, making it the most expensive modality per metre of deck covered.

Multi-pass acquisition: the pipeline supports two or more passes separated in time so the temporal model (Stage 4) has something to work with. Per-defect delta encoding (stable vs. worsening) requires at least two passes with pose consistency better than the smallest defect dimension of interest.

**Outputs:** synchronised per-modality streams with per-frame pose (UAV INS + GNSS-RTK, refined post-flight against ground control points or SfM bundle adjustment). Reprojection RMSE of the scene is logged as a preflight quality gate; in this mission (HVR-2026-04) it is 4.2 mm.

**Validation:** pose reprojection error against ground control points; per-modality coverage map checked before the pipeline advances; GNSS-RTK baseline convergence logged per pass.

---

## Stage 1. Per-modality feature extraction

Each modality is processed by an extractor selected for its signal characteristics. Every extractor outputs a per-modality dense feature map registered to a common structure-surface coordinate frame. Registration is a hard dependency for the fusion stage; features that are not co-registered are excluded rather than interpolated.

### 1.1 RGB ortho

**Method family:** self-supervised vision transformers (DINOv2) for general surface representation; fine-tuned segmentation heads for crack and corrosion classes. SfM/MVS (Colmap or OpenMVS) produces the underlying ortho mosaic and a textured mesh at sub-millimetre GSD (0.28 mm/px at 12 m AGL with the Zenmuse P1).

**Output:** per-pixel feature embedding (768-dim ViT tokens projected to 128-dim for the fusion stage) plus crack/corrosion logits projected onto the structure surface mesh.

**Validation:** pixel-level IoU against annotated crack masks on a held-out validation set; reliability diagrams to check that confidence is calibrated; multi-pass alignment error reported in pixels.

### 1.2 Thermal

**Method family:** ResNet-50 / ConvNeXt-T fine-tuned on radiometric thermal frames, with environmental correction applied before feature extraction: ambient temperature regression, solar irradiance model per material patch, emissivity priors derived from the RGB segmentation output. Without this correction, thermal features from morning and afternoon captures of the same span are not comparable, and the fusion model learns diurnal artefacts rather than defect signatures.

**Output:** per-pixel anomaly score and thermal-gradient field projected onto the structure surface.

**Validation:** AUROC against thermographic ground truth from instrumented panels; ambient-decorrelation check across diurnal captures; false-positive rate on known-healthy spans.

### 1.3 LiDAR

**Method family:** sparse 3D convolutions (Minkowski Engine) and PointNet++ for per-point feature extraction; deformation field computed as point-to-mesh signed distance against a registered baseline scan; surface reconstruction via screened Poisson for dense geometry.

**Output:** per-point feature embedding, per-point deformation magnitude and direction vector, surface mesh.

**Validation:** cross-validation of deformation magnitude against terrestrial laser scanner reference at selected spans; deformation noise floor quantified against repeated passes on a known-stable panel.

### 1.4 GPR (ground-penetrating radar)

**Method family:** classical B-scan preprocessing (DC removal, background subtraction, time-zero correction, Kirchhoff migration) followed by a Hough-transform hyperbola detector for rebar and void identification and a CFAR threshold for delamination signatures. Where material profiles are known, a physics-informed migration using the estimated permittivity model improves depth accuracy. A learned full-waveform inversion (DL-aided migration) is applied where classical migration under-performs on heterogeneous fills or where delamination depth is below the dominant wavelength.

**Output:** migrated B-scan with annotated reflectors; estimated permittivity field per traverse; subsurface confidence map projected onto the deck surface.

**Validation:** drilled cores at selected locations; panels of known rebar layout; depth accuracy reported with permittivity uncertainty bounds.

### 1.5 Acoustic emission / phased array

**Method family:** short-time Fourier transform spectrogram → ResNet/CNN for transient classification; CRNN for temporally coherent event sequences; phased-array delay-and-sum beamforming for 3D source localisation on the structure surface. Array geometry is optimised at deployment time for the target spans.

**Output:** time-localised acoustic event catalogue with per-event source position, frequency signature, and class probability.

**Validation:** pencil-lead-break tests at known positions before and after each deployment; localisation error in metres on the structure surface; false-positive rate against traffic and wind noise baselines.

### 1.6 X-ray backscatter

**Method family:** convolutional encoder over backscatter image strips; physics-informed normalisation against source-detector geometry (scatter angle, air-gap correction, material attenuation model for concrete and steel). The normalisation is the dominant engineering challenge for this modality: without it, absolute intensity comparisons between strips are unreliable across sessions. A 1D projection model (Beer-Lambert with scatter kernel) is fitted per strip before learned features are extracted. A second-order correction accounts for surface roughness as a function of the RGB surface texture.

**Output:** per-pixel internal-discontinuity score over the structural element under inspection; estimated duct grouting continuity profile for post-tensioned elements.

**Validation:** panels with engineered internal voids of known depth and diameter; depth-of-detection limit reported as a function of concrete cover and water-cement ratio; comparison with conventional radiographic ground truth on decommissioned deck samples.

**Operational constraints:** X-ray backscatter requires a radiation exclusion zone during scanning. UAV deployment constrains the source energy relative to a ground-crawler system; typical penetration depth with CS-400-class sources is 80–150 mm in normal-density concrete, sufficient to cover rebar zones and shallow duct profiles but not deep post-tension anchors. Coverage is therefore selective and prioritised by GPR anomaly locations.

---

## Stage 2. Cross-modal attention fusion

All per-modality features are projected into a common geometry-aware token space. Each token carries a 3D position on or under the structure surface and a modality identifier. A transformer fusion block performs cross-modal attention with a positional bias derived from the structure-relative coordinate, so tokens at the same physical location on the bridge attend strongly across modalities regardless of sensor resolution differences.

### 2.1 Variants

**Token-level cross-attention:** tokens from all modalities are concatenated; standard multi-head attention with modality-aware key/query projections. Modality dropout at training time (randomly masking one or more modalities per batch) forces the model to produce useful representations from any subset of available sensors — important because X-ray coverage in a real mission is typically 50–60%, not 100%.

**Geometry-conditioned attention:** attention weights are pre-multiplied by a learned function of token-pair 3D distance, biasing toward locally consistent fusion. This variant is more sample-efficient on small inspection corpora where some modality combinations are rare.

**Masked cross-modal pre-training:** before supervised fine-tuning, the fusion encoder is pre-trained with a masked-modality objective: one modality is masked out and the model must reconstruct its features from the others. This forces the encoder to learn genuinely cross-modal representations rather than unimodal shortcuts, and is particularly valuable when X-ray coverage is sparse or when a sensor fails mid-mission.

**Mixture-of-experts routing:** for structures with heterogeneous element types (deck, haunch, cable anchorage, expansion joint), a per-token router selects a subset of fusion experts based on structural element type derived from the IFC model or from a lightweight element classifier. This prevents the fusion weights learned on deck tokens from contaminating the fusion on subsurface duct tokens, where the dominant modality distribution is qualitatively different (GPR/X-ray dominant vs. RGB/thermal dominant on the deck surface).

### 2.2 Attention weight interpretation

The per-defect modality contribution bars in the evidence panel visualise the cross-modal attention weights at the defect location. These are the primary auditing surface for the fusion model: a defect where one modality accounts for >80% of the attention should be flagged for single-modality confirmation bias review. The uncertainty (σ) overlay on each bar reflects the posterior variance of the attention weight across the two inspection passes, not sensor noise.

**Validation:** per-modality ablation at test time; attention-weight inspection to confirm fusion is not collapsed onto a single modality; cross-modal coupling metric (off-diagonal attention mass fraction) logged per batch.

---

## Stage 3. Defect head

The fused token representation feeds three heads simultaneously.

### 3.1 Classification head

Per-token defect class probabilities over: crack (transverse, longitudinal, map), spalling, corrosion, delamination, void, exposed reinforcement, joint-seal failure, drainage failure. Multi-label output is supported: a single token may carry both corrosion and delamination probabilities above threshold, as is physically consistent at corroding anchorages.

### 3.2 Geometry head

Per-defect polygon on the structure surface (or volumetric extent for subsurface defects). Implemented as a query-based detector (DETR-family, conditioned on fused tokens) with structure-surface non-maximum suppression. Subsurface defects carry a depth estimate from the GPR/X-ray confidence map.

### 3.3 Conformal prediction for calibrated uncertainty

Rather than reporting raw softmax confidence, the defect head outputs a conformal prediction set: the smallest set of classes whose cumulative probability mass exceeds a user-specified coverage level (e.g. 90%). This is a distribution-free guarantee: on any new inspection scene drawn from the same data distribution, at least 90% of defects will have their true class in the reported set.

The confidence badge in the evidence panel (e.g. "88% conf") is the marginal probability of the top predicted class. The conformal set is used internally for triage: defects where the set contains more than one class are flagged for human review rather than automated action.

### 3.4 VLM description head

A compact VLM conditioned on the fused tokens for a defect region produces a natural-language description naming the modality evidence and the engineering interpretation. The description pipeline uses retrieval-augmented generation: the defect token is matched against a catalogue of annotated defect descriptions from prior inspections, and the retrieved examples condition generation to stay within the vocabulary expected by asset owners and structural engineers.

**Validation:** per-class precision/recall on a held-out bridge inventory; geometry IoU against manually drawn polygons; description faithfulness assessed by reference-checked review on a stratified sample.

---

## Stage 4. Temporal modelling and remaining useful life

Each defect persists across inspection passes. The temporal model maintains a per-defect state tracking growth (length, area, depth, severity probability) over time, conditioned on covariates: cumulative traffic load, weather exposure history (freeze-thaw cycles, rainfall accumulation), material profile, and prior repair events.

### 4.1 Temporal CNN — short-horizon classification

A 1D CNN over per-defect state sequences for short-horizon classification: worsening / stable / repaired. The `delta_severity` field in the data model is this classifier's output.

### 4.2 Physics-informed neural ODE — medium-horizon trajectory

A neural ordinary differential equation where the drift term is constrained to be consistent with classical concrete deterioration mechanics: carbonation front penetration (Fick's law), chloride diffusion, and Paris-law fatigue crack growth. The physics constraints reduce the number of labelled training examples needed to learn well-calibrated trajectories and prevent the model from predicting deterioration that violates mass conservation or monotone severity assumptions.

The ODE is solved numerically per defect at inference time. Latency is bounded by capping the number of solver steps, which is acceptable because the temporal horizon of interest (years) is much longer than the numerical integration step size (days).

### 4.3 Bayesian state-space model — long-horizon RUL

For long-horizon RUL estimation with a calibrated uncertainty band, a linear Gaussian state-space model (Kalman smoother variant) is fitted per defect. The posterior over hidden severity is propagated forward using the neural ODE drift as the transition model and the detection outputs as noisy observations.

The RUL chart in the evidence panel shows the expected risk trajectory (sigmoid of posterior mean severity) with an 80% credible interval. The action threshold line (risk = 0.5) intersects the mean trajectory at the RUL estimate. The red vertical marker labels that crossing point in years.

**Extreme value theory for tail risk:** for safety-critical elements (post-tension ducts, stay-cable anchorages), the tail of the RUL distribution — not just the mean — determines maintenance scheduling. Generalised extreme value (GEV) fitting to the ensemble of posterior RUL samples provides a conservative lower bound used for legal compliance reporting, distinct from the median estimate shown in the visualizer.

**Validation:** backtesting on inspection histories with known maintenance events; calibration of the RUL credible interval (empirical coverage vs. nominal coverage); comparison against code-based deterministic deterioration models (fib Model Code 2020).

---

## Stage 5. Edge inference on UAV processor

The trained pipeline is compressed for on-UAV inference, with a per-stage compute budget derived from flight duration and battery margin.

### 5.1 Quantisation

Post-training INT8 quantisation for convolutional and attention layers, with per-channel calibration sets sampled from validation inspection footage. Sensitive layers (fusion attention, conformal calibration look-up) remain in FP16. Mixed-precision schedules are profiled per target device.

### 5.2 Structured pruning

Attention heads and fusion-block channels are pruned with a Lagrangian sparsity term during fine-tuning. Target sparsity: 50% of attention heads and 40% of intermediate channels, validated against a ≤3% detection-rate degradation budget.

### 5.3 Knowledge distillation

A high-capacity server-side teacher model distils into the on-UAV student via soft-label distillation at the defect-head output and intermediate-layer feature matching at the fusion block. This consistently outperforms direct quantisation-aware training on small inspection datasets.

### 5.4 Saliency-gated execution

Per-modality extractors run continuously during flight. The fusion and defect head run only on regions flagged by a lightweight saliency model (MobileNet-V3 distilled from the offline defect head), reducing compute to structurally interesting regions. On a 180-second bridge pass this reduces fusion calls by approximately 70% without measurable detection-rate loss.

### 5.5 Target hardware benchmarks

| Platform | TOPs | Fusion latency ms/frame | Power draw |
|---|---|---|---|
| NVIDIA Jetson Orin Nano 8 GB | 40 | 28 | 7–10 W |
| Hailo-15H | 100 | 12 | 3.5 W |
| NXP i.MX 95 + NPU | 33 | 38 | 4 W |
| Qualcomm RB3 Gen 2 | 12 | 65 | 5 W |

Hailo-15H is the preferred deployment target for new missions: highest throughput-per-watt, enabling longer flight times or higher-frequency defect-head inference. Jetson Orin Nano remains the reference platform for software development because of its mature CUDA toolchain.

**Validation:** end-to-end frame-rate test on target device with bundled validation data; accuracy degradation vs. full-precision offline model < 3%; thermal throttle test at maximum ambient temperature for summer deployments.

---

## Stage 6. BIM/IFC integration and digital twin linkage

Each defect output carries a reference to the structural element it belongs to (deck segment, haunch, pier, cable, expansion joint). This reference is resolved against the bridge's IFC model (ISO 16739) if one is available, enabling two-way linkage: the inspection system queries the structural model for material properties and maintenance history, and writes detection results back as IFC property sets on the corresponding element.

**Digital twin synchronisation:** for bridges on a continuous monitoring contract, the per-defect state vector (class, severity, area, depth, RUL estimate) is pushed to the digital twin at the end of each inspection pass. The twin's physics simulation uses the updated defect state to recompute structural capacity margins and flag elements where the margin has dropped below the code-required threshold.

**Practical implementation:** the IFC element ID is embedded in the defect record at registration time. Asset management platforms that consume IFC (Autodesk BIM 360, Bentley iTwin, Trimble Connect) can ingest the inspection results without a separate import step.

---

## Stage 7. Data governance and provenance

The pipeline only earns its conclusions if the data lineage is fully traceable. Every per-defect output retains references to: the source frames (by frame ID and pass timestamp), the per-modality feature tensors (by hash), the fusion attention map, the model version and git commit, and the inspection pass identifier. The evidence panel is the human-facing surface of that lineage.

**Chain of custody:** raw sensor data is signed at acquisition time using the UAV's onboard hardware security module. The signature chain is validated at each processing step so that an auditor can confirm the detection output corresponds to unmodified sensor data from the claimed inspection date.

**Privacy:** where photogrammetric imagery incidentally captures road users, faces and licence plates are blurred before storage using a lightweight on-device detector. Retention follows the asset owner's infrastructure data policy (typically 10–25 years for structural records).

**Open data:** where the STRUCTURE project produces publicly releasable datasets from operational bridges (subject to owner consent and safety review), they will be published under CC BY 4.0 with per-defect provenance metadata aligned with the data schema used here.

---

## Cross-cutting: validation metrics

The key metrics tracked across the full pipeline against operational STRUCTURE project data:

- Per-class detection precision/recall at the structure level (not per-image)
- Geometry IoU for surface defects; depth accuracy ± uncertainty for subsurface defects
- Fusion modality ablation: delta detection rate when each modality is withheld at inference
- RUL calibration: empirical coverage of the credible interval vs. nominal on held-out histories
- Edge accuracy degradation: full-precision vs. INT8 student on identical inputs (target < 3%)
- Conformal set size: mean number of classes in the prediction set at 90% coverage level

---

## References

**Stage 1.1 RGB:** Oquab et al. (2023) "DINOv2: Learning Robust Visual Features without Supervision." Brilakis et al. (2023) review of vision-based infrastructure inspection.

**Stage 1.2 Thermal:** Liu et al. (2022) "A ConvNet for the 2020s (ConvNeXt)." Deane et al. (2021) "Automation of bridge inspection using thermal UAV surveys."

**Stage 1.3 LiDAR:** Choy et al. (2019) "4D Spatio-Temporal ConvNets: Minkowski Convolutional Neural Networks." Qi et al. (2017) "PointNet++."

**Stage 1.4 GPR:** Saarenketo & Scullion (2000) GPR review. Dinh et al. (2021) deep-learning-aided GPR migration for bridge deck inspection.

**Stage 1.5 Acoustic:** Grosse & Ohtsu (2008) "Acoustic Emission Testing." Shokouhi et al. (2018) CRNN for AE source characterisation.

**Stage 1.6 X-ray:** Kasperl et al. (2019) "Backscatter X-ray for concrete structure inspection." Hussein et al. (2022) physics-informed normalisation for portable backscatter systems.

**Stage 2 Fusion:** Vaswani et al. (2017) "Attention Is All You Need." He et al. (2022) "Masked Autoencoders Are Scalable Vision Learners." Shazeer et al. (2017) "Outrageously Large Neural Networks" (mixture-of-experts routing).

**Stage 3 Conformal:** Angelopoulos & Bates (2022) "A Gentle Introduction to Conformal Prediction and Distribution-Free Uncertainty Quantification."

**Stage 4 RUL:** Chen et al. (2018) "Neural Ordinary Differential Equations." Thoft-Christensen & Baker (1982) structural reliability theory. Coles (2001) "An Introduction to Statistical Modeling of Extreme Values."

**Stage 5 Edge:** NVIDIA Jetson Orin Nano datasheet (2023). Hailo-15 product brief (2024). Jacob et al. (2018) "Quantization and Training of Neural Networks for Efficient Integer-Arithmetic-Only Inference."

**Stage 6 BIM/IFC:** ISO 16739-1:2018 "Industry Foundation Classes." buildingSMART International (2022) IFC4 ADD2 TC1.

**Stage 7 Provenance:** W3C PROV-DM (2013) provenance data model. FAIR data principles: Wilkinson et al. (2016).
