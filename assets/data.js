/* gisgap-uav-structure — scene data v2
   Synthetic sensor scene georeferenced to Hovenring, Eindhoven.
   Changes from v1:
     - Mulberry32 seeded RNG → LiDAR stipple and acoustic jitter are stable across reloads
     - X-ray backscatter modality: scan strips geometry, MODALITIES entry
     - Two new defects: D-009 (inner-haunch void, GPR+X-ray) and D-010 (outer-haunch delam)
     - All defects carry confidence, area_mm2, delta_severity, and per-modality sigma
     - INSPECTION metadata object (mission, platform, sensors, coverage %)
*/

(function (global) {
  "use strict";

  // ────────── Seeded RNG (Mulberry32) ──────────
  // Fixed seed → deterministic layout. LiDAR stipple and acoustic jitter do not
  // change between page loads so the visual scene is stable.
  function mulberry32(seed) {
    return function () {
      seed |= 0;
      seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rng = mulberry32(0xB4745EEF);

  // ────────── Scene centre ──────────
  // Hovenring, Eindhoven. OSM bridge relation 11828913.
  // Cable-stayed suspended cycling roundabout viaduct, ring radius ≈ 33 m.
  const CENTER = [5.41976, 51.43336];

  // WGS84 flat-earth helpers (valid at ≤ 200 m scale around CENTER)
  const M_PER_DEG_LAT = 111320;
  const M_PER_DEG_LNG = 111320 * Math.cos((CENTER[1] * Math.PI) / 180);

  function offset(cx, dxM, dyM) {
    return [cx[0] + dxM / M_PER_DEG_LNG, cx[1] + dyM / M_PER_DEG_LAT];
  }

  // ────────── Inspection metadata ──────────
  const INSPECTION = {
    mission_id:   "HVR-2026-04",
    date:         "2026-04-29",
    platform:     "DJI Matrice 350 RTK",
    sensors: [
      "RGB 42 MP (Zenmuse P1)",
      "FLIR Boson+ 640 thermal",
      "Velodyne VLP-32C LiDAR",
      "GSSI SIR-4000 200 MHz GPR",
      "PCB 352C65 acoustic (×8)",
      "Compumedics CS-400 X-ray backscatter",
    ],
    altitude_agl_m:         { rgb: 12, thermal: 18, lidar: 22, gpr: 0.5, acoustic: 4, xray: 3 },
    passes:                 2,
    gsd_mm_px:              { rgb: 0.28, thermal: 12 },
    lidar_density_pt_m2:    340,
    gpr_traverse_spacing_m: 1.5,
    gnss_mode:              "RTK",
    reprojection_rmse_mm:   4.2,
    coverage_pct: {
      rgb:      98.4,
      thermal:  96.1,
      lidar:    99.2,
      gpr:      87.3,
      acoustic: 72.8,
      xray:     54.6,
    },
  };

  // ────────── Geometry generators ──────────

  function ringPolygon(rInner, rOuter, n) {
    const outer = [], inner = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * 2 * Math.PI;
      outer.push(offset(CENTER, rOuter * Math.cos(a), rOuter * Math.sin(a)));
      inner.push(offset(CENTER, rInner * Math.cos(a), rInner * Math.sin(a)));
    }
    return {
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [outer, inner.reverse()] },
      properties: { name: "Hovenring deck (synthetic outline)" },
    };
  }

  function flightPath(rOuter, rInner, n) {
    const outer = [], inner = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * 2 * Math.PI;
      outer.push(offset(CENTER, rOuter * Math.cos(a), rOuter * Math.sin(a)));
      inner.push(offset(CENTER, rInner * Math.cos(a), rInner * Math.sin(a)));
    }
    return {
      type: "FeatureCollection",
      features: [
        { type: "Feature", geometry: { type: "LineString", coordinates: outer }, properties: { pass: "outer", altitude_m: 18 } },
        { type: "Feature", geometry: { type: "LineString", coordinates: inner }, properties: { pass: "inner", altitude_m: 14 } },
      ],
    };
  }

  function rgbFootprints(rInner, rOuter, n) {
    const features = [];
    const radii = [rInner + 2, (rInner + rOuter) / 2, rOuter - 2];
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * 2 * Math.PI;
      const a1 = ((i + 1) / n) * 2 * Math.PI;
      for (const r of radii) {
        const r0 = r - 1.5, r1 = r + 1.5;
        const ring = [
          offset(CENTER, r0 * Math.cos(a0), r0 * Math.sin(a0)),
          offset(CENTER, r1 * Math.cos(a0), r1 * Math.sin(a0)),
          offset(CENTER, r1 * Math.cos(a1), r1 * Math.sin(a1)),
          offset(CENTER, r0 * Math.cos(a1), r0 * Math.sin(a1)),
        ];
        ring.push(ring[0]);
        features.push({
          type: "Feature",
          geometry: { type: "Polygon", coordinates: [ring] },
          properties: { gsd_mm_px: 0.28 },
        });
      }
    }
    return { type: "FeatureCollection", features };
  }

  function thermalField(defects) {
    return {
      type: "FeatureCollection",
      features: defects
        .filter(d => d.modality_evidence.find(m => m.key === "thermal" && m.attention > 0.05))
        .map(d => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: d.coords },
          properties: { intensity: d.modality_evidence.find(m => m.key === "thermal").attention },
        })),
    };
  }

  function lidarPoints(rInner, rOuter, n) {
    const features = [];
    for (let i = 0; i < n; i++) {
      const a = rng() * 2 * Math.PI;
      const r = rInner + rng() * (rOuter - rInner);
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: offset(CENTER, r * Math.cos(a), r * Math.sin(a)) },
        properties: { density_class: 1 },
      });
    }
    return { type: "FeatureCollection", features };
  }

  function gprLines(rInner, rOuter, n) {
    const features = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 2 * Math.PI;
      features.push({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: [
            offset(CENTER, rInner * Math.cos(a), rInner * Math.sin(a)),
            offset(CENTER, rOuter * Math.cos(a), rOuter * Math.sin(a)),
          ],
        },
        properties: { traverse: i, depth_m: 0.3 },
      });
    }
    return { type: "FeatureCollection", features };
  }

  function acousticEvents(defects) {
    const features = [];
    defects.forEach(d => {
      const ev = d.modality_evidence.find(m => m.key === "acoustic");
      if (!ev || ev.attention < 0.05) return;
      const dx = (rng() - 0.5) * 6;
      const dy = (rng() - 0.5) * 6;
      features.push({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [
            d.coords[0] + dx / M_PER_DEG_LNG,
            d.coords[1] + dy / M_PER_DEG_LAT,
          ],
        },
        properties: { intensity: ev.attention },
      });
    });
    return { type: "FeatureCollection", features };
  }

  // X-ray backscatter scan strips — narrow polygons (~1.6 m wide) crossing the deck.
  // Placed at defect-adjacent angles and structural nodes (cable anchorages, expansion
  // joints, mid-span haunches). Coverage is selective: X-ray traversal is slow.
  function xrayStrips(rInner, rOuter, angles_deg) {
    const hw = 0.8; // half-width in metres
    const features = [];
    angles_deg.forEach((deg, i) => {
      const a    = (deg * Math.PI) / 180;
      const perp = a + Math.PI / 2;
      const p0   = offset(CENTER, rInner * Math.cos(a), rInner * Math.sin(a));
      const p1   = offset(CENTER, rOuter * Math.cos(a), rOuter * Math.sin(a));
      const corners = [
        [p0[0] + hw * Math.cos(perp) / M_PER_DEG_LNG, p0[1] + hw * Math.sin(perp) / M_PER_DEG_LAT],
        [p0[0] - hw * Math.cos(perp) / M_PER_DEG_LNG, p0[1] - hw * Math.sin(perp) / M_PER_DEG_LAT],
        [p1[0] - hw * Math.cos(perp) / M_PER_DEG_LNG, p1[1] - hw * Math.sin(perp) / M_PER_DEG_LAT],
        [p1[0] + hw * Math.cos(perp) / M_PER_DEG_LNG, p1[1] + hw * Math.sin(perp) / M_PER_DEG_LAT],
      ];
      corners.push(corners[0]);
      features.push({
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [corners] },
        properties: { strip: i, angle_deg: deg, source: "Compumedics CS-400" },
      });
    });
    return { type: "FeatureCollection", features };
  }

  // ────────── Defects ──────────
  // Fields:
  //   id, angle_deg, radius   — polar position on the ring deck
  //   class, severity         — taxonomy and triage level
  //   confidence              — fusion model output confidence (0–1)
  //   area_mm2                — estimated surface/subsurface footprint area
  //   first_seen              — inspection pass of first detection
  //   delta_severity          — 0 = stable, 1 = worsened since prior pass
  //   modality_evidence[]     — attention weight + uncertainty sigma per modality
  //   vlm                     — VLM-style natural-language evidence statement
  //   action                  — recommended engineering response
  //   rul_years               — remaining-useful-life estimate (Bayesian state-space)

  const DEFECTS_RAW = [
    {
      id: "D-001", angle_deg: 12, radius: 33,
      class: "crack", severity: "medium", confidence: 0.87, area_mm2: 180,
      first_seen: "2025-09-14", delta_severity: 0,
      modality_evidence: [
        { key: "rgb",      label: "RGB ortho",  attention: 0.46, sigma: 0.04 },
        { key: "thermal",  label: "Thermal",    attention: 0.18, sigma: 0.06 },
        { key: "lidar",    label: "LiDAR",      attention: 0.22, sigma: 0.05 },
        { key: "gpr",      label: "GPR",        attention: 0.05, sigma: 0.03 },
        { key: "acoustic", label: "Acoustic",   attention: 0.09, sigma: 0.04 },
      ],
      vlm: "Transverse hairline crack on the upper deck surface, visible in RGB ortho with sub-millimetre width. Thermal frame shows a faint linear gradient consistent with moisture intrusion. LiDAR registers a depth discontinuity below the noise floor of a single pass but above the multi-pass repeatability bound.",
      action: "Re-image with closer-altitude RGB pass at next inspection cycle; tag for crack-width tracking against last quarter's baseline.",
      rul_years: 8.5,
    },
    {
      id: "D-002", angle_deg: 58, radius: 33,
      class: "corrosion", severity: "high", confidence: 0.92, area_mm2: 2400,
      first_seen: "2024-11-02", delta_severity: 1,
      modality_evidence: [
        { key: "rgb",      label: "RGB ortho",  attention: 0.38, sigma: 0.05 },
        { key: "thermal",  label: "Thermal",    attention: 0.27, sigma: 0.07 },
        { key: "lidar",    label: "LiDAR",      attention: 0.10, sigma: 0.04 },
        { key: "gpr",      label: "GPR",        attention: 0.15, sigma: 0.05 },
        { key: "acoustic", label: "Acoustic",   attention: 0.10, sigma: 0.04 },
      ],
      vlm: "Corrosion staining at a stay-cable anchorage, with a co-located thermal anomaly suggesting active moisture activity. GPR over the anchorage zone shows an attenuated reflector consistent with section loss in the embedded steel.",
      action: "Schedule close-range borescope inspection of the anchorage; commission GPR full-waveform inversion over the zone.",
      rul_years: 4.0,
    },
    {
      id: "D-003", angle_deg: 105, radius: 33,
      class: "delam", severity: "high", confidence: 0.91, area_mm2: 18500,
      first_seen: "2025-03-21", delta_severity: 0,
      modality_evidence: [
        { key: "rgb",      label: "RGB ortho",  attention: 0.10, sigma: 0.03 },
        { key: "thermal",  label: "Thermal",    attention: 0.42, sigma: 0.06 },
        { key: "lidar",    label: "LiDAR",      attention: 0.08, sigma: 0.03 },
        { key: "gpr",      label: "GPR",        attention: 0.32, sigma: 0.06 },
        { key: "acoustic", label: "Acoustic",   attention: 0.08, sigma: 0.03 },
      ],
      vlm: "Subsurface delamination in the deck soffit, primarily evident in thermal contrast against a sun-loaded background and confirmed by GPR amplitude inversion at ~30 mm depth.",
      action: "Mark for sounding survey on next on-foot inspection; consider cathodic-protection survey at this span.",
      rul_years: 5.5,
    },
    {
      id: "D-004", angle_deg: 162, radius: 33,
      class: "void", severity: "medium", confidence: 0.83, area_mm2: 6200,
      first_seen: "2025-07-08", delta_severity: 0,
      modality_evidence: [
        { key: "rgb",      label: "RGB ortho",  attention: 0.04, sigma: 0.02 },
        { key: "thermal",  label: "Thermal",    attention: 0.12, sigma: 0.04 },
        { key: "lidar",    label: "LiDAR",      attention: 0.06, sigma: 0.03 },
        { key: "gpr",      label: "GPR",        attention: 0.62, sigma: 0.07 },
        { key: "acoustic", label: "Acoustic",   attention: 0.16, sigma: 0.05 },
      ],
      vlm: "Internal void in the haunched section near the central support, dominantly visible in GPR b-scan as a discrete hyperbola at ~80 mm depth, with a coincident acoustic event during traffic loading.",
      action: "Schedule X-ray backscatter pass over this segment; flag for structural-engineer review of post-tension duct grouting records.",
      rul_years: 6.5,
    },
    {
      id: "D-005", angle_deg: 215, radius: 33,
      class: "spall", severity: "low", confidence: 0.95, area_mm2: 870,
      first_seen: "2026-01-30", delta_severity: 0,
      modality_evidence: [
        { key: "rgb",      label: "RGB ortho",  attention: 0.55, sigma: 0.04 },
        { key: "thermal",  label: "Thermal",    attention: 0.10, sigma: 0.04 },
        { key: "lidar",    label: "LiDAR",      attention: 0.28, sigma: 0.05 },
        { key: "gpr",      label: "GPR",        attention: 0.04, sigma: 0.02 },
        { key: "acoustic", label: "Acoustic",   attention: 0.03, sigma: 0.02 },
      ],
      vlm: "Surface spall on the deck edge, well resolved by RGB and confirmed by LiDAR depth deviation of ~8 mm over a 40 mm patch. Thermal and GPR are uninformative at this geometry.",
      action: "Cosmetic; track for growth, no immediate action.",
      rul_years: 14.0,
    },
    {
      id: "D-006", angle_deg: 268, radius: 33,
      class: "crack", severity: "high", confidence: 0.89, area_mm2: 320,
      first_seen: "2025-05-12", delta_severity: 1,
      modality_evidence: [
        { key: "rgb",      label: "RGB ortho",  attention: 0.40, sigma: 0.05 },
        { key: "thermal",  label: "Thermal",    attention: 0.22, sigma: 0.06 },
        { key: "lidar",    label: "LiDAR",      attention: 0.16, sigma: 0.05 },
        { key: "gpr",      label: "GPR",        attention: 0.08, sigma: 0.03 },
        { key: "acoustic", label: "Acoustic",   attention: 0.14, sigma: 0.05 },
      ],
      vlm: "Longitudinal crack approaching propagation threshold near the deck-to-pier interface. RGB resolves a width above the prior quarter's baseline; acoustic emission records two transient events within the last loading cycle co-located by beamforming.",
      action: "Elevate to monthly inspection cadence; instrument with a fibre-Bragg-grating strain sensor at the next maintenance window.",
      rul_years: 3.5,
    },
    {
      id: "D-007", angle_deg: 312, radius: 33,
      class: "corrosion", severity: "low", confidence: 0.78, area_mm2: 430,
      first_seen: "2026-02-18", delta_severity: 0,
      modality_evidence: [
        { key: "rgb",      label: "RGB ortho",  attention: 0.34, sigma: 0.05 },
        { key: "thermal",  label: "Thermal",    attention: 0.20, sigma: 0.06 },
        { key: "lidar",    label: "LiDAR",      attention: 0.06, sigma: 0.03 },
        { key: "gpr",      label: "GPR",        attention: 0.20, sigma: 0.05 },
        { key: "acoustic", label: "Acoustic",   attention: 0.20, sigma: 0.05 },
      ],
      vlm: "Early-stage surface corrosion on a drainage scupper. Thermal anomaly confirms moisture pooling. No subsurface signature in GPR; acoustic background only.",
      action: "Route to drainage maintenance; re-evaluate at next quarterly pass.",
      rul_years: 11.0,
    },
    {
      id: "D-008", angle_deg: 340, radius: 33,
      class: "delam", severity: "medium", confidence: 0.86, area_mm2: 9800,
      first_seen: "2025-12-03", delta_severity: 0,
      modality_evidence: [
        { key: "rgb",      label: "RGB ortho",  attention: 0.08, sigma: 0.03 },
        { key: "thermal",  label: "Thermal",    attention: 0.36, sigma: 0.06 },
        { key: "lidar",    label: "LiDAR",      attention: 0.10, sigma: 0.04 },
        { key: "gpr",      label: "GPR",        attention: 0.36, sigma: 0.06 },
        { key: "acoustic", label: "Acoustic",   attention: 0.10, sigma: 0.04 },
      ],
      vlm: "Bounded delamination patch in the wearing course, picked up by thermal under solar load and corroborated by GPR amplitude attenuation at shallow depth.",
      action: "Tag for partial-depth patch repair at next planned closure.",
      rul_years: 7.0,
    },

    // ── New defects — first detected in v2 pass (April 2026) ─────────────────

    {
      // Post-tension duct void at the inner haunch — subsurface, no RGB/thermal/LiDAR
      // signal; GPR+X-ray primary. Structural-safety-level finding.
      id: "D-009", angle_deg: 78, radius: 28,
      class: "void", severity: "high", confidence: 0.88, area_mm2: 11200,
      first_seen: "2026-04-29", delta_severity: 1,
      modality_evidence: [
        { key: "rgb",      label: "RGB ortho",  attention: 0.04, sigma: 0.02 },
        { key: "thermal",  label: "Thermal",    attention: 0.07, sigma: 0.03 },
        { key: "lidar",    label: "LiDAR",      attention: 0.05, sigma: 0.02 },
        { key: "gpr",      label: "GPR",        attention: 0.51, sigma: 0.07 },
        { key: "acoustic", label: "Acoustic",   attention: 0.14, sigma: 0.04 },
        { key: "xray",     label: "X-ray",      attention: 0.19, sigma: 0.05 },
      ],
      vlm: "Post-tension duct void at the inner haunch. GPR b-scan shows a discrete hyperbola at 95 mm depth consistent with an un-grouted duct segment; X-ray backscatter corroborates a 110 mm-wide internal discontinuity in the duct profile. RGB, thermal, and LiDAR provide no surface-level signal — the defect is fully subsurface. Duct grouting integrity is at risk; this is a structural-safety-level finding.",
      action: "Commission X-ray full-coverage re-scan of this quadrant at next maintenance window; notify structural engineer for immediate duct grouting assessment and post-tension force audit.",
      rul_years: 3.2,
    },
    {
      // Wearing-course delamination at the outer haunch near an expansion joint.
      // Thermal + GPR primary; X-ray provides marginal confirmation.
      id: "D-010", angle_deg: 245, radius: 35,
      class: "delam", severity: "medium", confidence: 0.80, area_mm2: 6700,
      first_seen: "2026-04-29", delta_severity: 0,
      modality_evidence: [
        { key: "rgb",      label: "RGB ortho",  attention: 0.13, sigma: 0.04 },
        { key: "thermal",  label: "Thermal",    attention: 0.38, sigma: 0.06 },
        { key: "lidar",    label: "LiDAR",      attention: 0.09, sigma: 0.03 },
        { key: "gpr",      label: "GPR",        attention: 0.26, sigma: 0.06 },
        { key: "acoustic", label: "Acoustic",   attention: 0.07, sigma: 0.03 },
        { key: "xray",     label: "X-ray",      attention: 0.07, sigma: 0.03 },
      ],
      vlm: "Wearing-course delamination at the outer haunch near the expansion joint. Thermal imaging under solar load emphasises the subsurface air gap; GPR shows a shallow attenuated reflector at ~20 mm. RGB shows minor surface blistering consistent with the thermal footprint. X-ray provides marginal confirmation; LiDAR does not yet resolve measurable surface displacement.",
      action: "Tag for wearing-course patch at next planned closure; monitor expansion-joint seal integrity at the co-located joint.",
      rul_years: 6.0,
    },
  ];

  // X-ray scan angles: defect-adjacent + structural nodes (cable anchorages and
  // expansion joints occur at ≈ every 40–45° on the Hovenring ring).
  const XRAY_STRIP_ANGLES = [12, 45, 78, 105, 162, 210, 245, 290, 340];

  // Resolve each defect's polar coordinates → WGS84
  const DEFECTS = DEFECTS_RAW.map(d => {
    const a = (d.angle_deg * Math.PI) / 180;
    return { ...d, coords: offset(CENTER, d.radius * Math.cos(a), d.radius * Math.sin(a)) };
  });

  // ────────── Modality registry ──────────
  const MODALITIES = {
    rgb:      { label: "RGB ortho",         stage: "rgb",         color: "#1f6feb", default: true  },
    thermal:  { label: "Thermal",           stage: "thermal",     color: "#dd6b20", default: false },
    lidar:    { label: "LiDAR",             stage: "lidar",       color: "#319795", default: false },
    gpr:      { label: "GPR",               stage: "gpr",         color: "#805ad5", default: false },
    acoustic: { label: "Acoustic",          stage: "acoustic",    color: "#2f855a", default: false },
    xray:     { label: "X-ray backscatter", stage: "xray",        color: "#e53e3e", default: false },
    fused:    { label: "Fused defects",     stage: "fusion",      color: "#c53030", default: true  },
    flight:   { label: "UAV flight path",   stage: "acquisition", color: "#1a202c", default: true  },
  };

  // ────────── Pre-computed geometry ──────────
  const GEOM = {
    bridge:   ringPolygon(30, 36, 96),
    flight:   flightPath(40, 26, 96),
    rgb:      rgbFootprints(30, 36, 36),
    thermal:  thermalField(DEFECTS),
    lidar:    lidarPoints(30, 36, 420),
    gpr:      gprLines(28, 38, 22),
    acoustic: acousticEvents(DEFECTS),
    xray:     xrayStrips(29, 37, XRAY_STRIP_ANGLES),
    defects: {
      type: "FeatureCollection",
      features: DEFECTS.map(d => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: d.coords },
        properties: {
          id:             d.id,
          class:          d.class,
          severity:       d.severity,
          confidence:     d.confidence,
          delta_severity: d.delta_severity,
          area_mm2:       d.area_mm2,
        },
      })),
    },
  };

  global.GISGAP_DATA = { CENTER, DEFECTS, MODALITIES, GEOM, INSPECTION };
})(window);
