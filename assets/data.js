/* gisgap-uav-structure — scene data (synthetic, georeferenced to Hovenring, Eindhoven) */

(function (global) {
  "use strict";

  // Hovenring, Eindhoven (suspended cycling roundabout viaduct)
  const CENTER = [5.45412, 51.45093];

  // WGS84 helpers — flat-earth approximation around the scene center
  const M_PER_DEG_LAT = 111320;
  const M_PER_DEG_LNG = 111320 * Math.cos((CENTER[1] * Math.PI) / 180);
  function offset(centerLngLat, dxMeters, dyMeters) {
    return [
      centerLngLat[0] + dxMeters / M_PER_DEG_LNG,
      centerLngLat[1] + dyMeters / M_PER_DEG_LAT,
    ];
  }

  // Generate a ring polygon (annulus approximation) for the cable-stayed cycle deck
  function ringPolygon(rInner, rOuter, n) {
    const outer = [];
    const inner = [];
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

  // UAV trajectory: a slightly larger ring at flight altitude, plus a centerline pass
  function flightPath(rOuter, rInner, n) {
    const outerRing = [];
    const innerRing = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * 2 * Math.PI;
      outerRing.push(offset(CENTER, rOuter * Math.cos(a), rOuter * Math.sin(a)));
      innerRing.push(offset(CENTER, rInner * Math.cos(a), rInner * Math.sin(a)));
    }
    return {
      type: "FeatureCollection",
      features: [
        { type: "Feature", geometry: { type: "LineString", coordinates: outerRing }, properties: { pass: "outer", altitude_m: 18 } },
        { type: "Feature", geometry: { type: "LineString", coordinates: innerRing }, properties: { pass: "inner", altitude_m: 14 } },
      ],
    };
  }

  // RGB ortho mosaic footprints — grid of small polygons over the deck
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
          properties: { gsd_mm_px: 0.3 },
        });
      }
    }
    return { type: "FeatureCollection", features };
  }

  // Thermal anomaly hotspots — circular features around defect coordinates
  function thermalField(defects) {
    return {
      type: "FeatureCollection",
      features: defects
        .filter((d) => d.modality_evidence.find((m) => m.key === "thermal" && m.attention > 0.05))
        .map((d) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: d.coords },
          properties: { intensity: d.modality_evidence.find((m) => m.key === "thermal").attention },
        })),
    };
  }

  // LiDAR sample points — coverage stipple over deck
  function lidarPoints(rInner, rOuter, n) {
    const features = [];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 2 * Math.PI;
      const r = rInner + Math.random() * (rOuter - rInner);
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: offset(CENTER, r * Math.cos(a), r * Math.sin(a)) },
        properties: { density_class: 1 },
      });
    }
    return { type: "FeatureCollection", features };
  }

  // GPR scan lines — radial transects across the deck
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
        properties: { traverse: i },
      });
    }
    return { type: "FeatureCollection", features };
  }

  // Acoustic events — sparse points biased toward defects
  function acousticEvents(defects) {
    const features = [];
    defects.forEach((d) => {
      const ev = d.modality_evidence.find((m) => m.key === "acoustic");
      if (!ev || ev.attention < 0.05) return;
      // jitter an event slightly off the defect to feel like beamformed source
      const dx = (Math.random() - 0.5) * 6;
      const dy = (Math.random() - 0.5) * 6;
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

  // Defects — anchored along the ring (radius = 33 m, midline of the deck)
  // Each defect carries multi-modal evidence with attention weights
  const DEFECTS_RAW = [
    {
      id: "D-001",
      angle_deg: 12,
      radius: 33,
      class: "crack",
      severity: "medium",
      first_seen: "2025-09-14",
      modality_evidence: [
        { key: "rgb", label: "RGB ortho", attention: 0.46 },
        { key: "thermal", label: "Thermal", attention: 0.18 },
        { key: "lidar", label: "LiDAR", attention: 0.22 },
        { key: "gpr", label: "GPR", attention: 0.05 },
        { key: "acoustic", label: "Acoustic", attention: 0.09 },
      ],
      vlm:
        "Transverse hairline crack on the upper deck surface, visible in RGB ortho with sub-millimetre width. Thermal frame shows a faint linear gradient consistent with moisture intrusion. LiDAR registers a depth discontinuity below the noise floor of a single pass but above the multi-pass repeatability bound.",
      action:
        "Re-image with closer-altitude RGB pass at next inspection cycle; tag for crack-width tracking against last quarter's baseline.",
      rul_years: 8.5,
    },
    {
      id: "D-002",
      angle_deg: 58,
      radius: 33,
      class: "corrosion",
      severity: "high",
      first_seen: "2024-11-02",
      modality_evidence: [
        { key: "rgb", label: "RGB ortho", attention: 0.38 },
        { key: "thermal", label: "Thermal", attention: 0.27 },
        { key: "lidar", label: "LiDAR", attention: 0.10 },
        { key: "gpr", label: "GPR", attention: 0.15 },
        { key: "acoustic", label: "Acoustic", attention: 0.10 },
      ],
      vlm:
        "Corrosion staining at a stay-cable anchorage, with a co-located thermal anomaly suggesting active moisture activity. GPR over the anchorage zone shows an attenuated reflector consistent with section loss in the embedded steel.",
      action:
        "Schedule close-range borescope inspection of the anchorage; commission GPR full-waveform inversion over the zone.",
      rul_years: 4.0,
    },
    {
      id: "D-003",
      angle_deg: 105,
      radius: 33,
      class: "delam",
      severity: "high",
      first_seen: "2025-03-21",
      modality_evidence: [
        { key: "rgb", label: "RGB ortho", attention: 0.10 },
        { key: "thermal", label: "Thermal", attention: 0.42 },
        { key: "lidar", label: "LiDAR", attention: 0.08 },
        { key: "gpr", label: "GPR", attention: 0.32 },
        { key: "acoustic", label: "Acoustic", attention: 0.08 },
      ],
      vlm:
        "Subsurface delamination in the deck soffit, primarily evident in thermal contrast against a sun-loaded background and confirmed by GPR amplitude inversion at ~30 mm depth.",
      action:
        "Mark for sounding survey on next on-foot inspection; consider cathodic-protection survey at this span.",
      rul_years: 5.5,
    },
    {
      id: "D-004",
      angle_deg: 162,
      radius: 33,
      class: "void",
      severity: "medium",
      first_seen: "2025-07-08",
      modality_evidence: [
        { key: "rgb", label: "RGB ortho", attention: 0.04 },
        { key: "thermal", label: "Thermal", attention: 0.12 },
        { key: "lidar", label: "LiDAR", attention: 0.06 },
        { key: "gpr", label: "GPR", attention: 0.62 },
        { key: "acoustic", label: "Acoustic", attention: 0.16 },
      ],
      vlm:
        "Internal void in the haunched section near the central support, dominantly visible in GPR b-scan as a discrete hyperbola at ~80 mm depth, with a coincident acoustic event during traffic loading.",
      action:
        "Schedule X-ray backscatter pass over this segment; flag for structural-engineer review of post-tension duct grouting records.",
      rul_years: 6.5,
    },
    {
      id: "D-005",
      angle_deg: 215,
      radius: 33,
      class: "spall",
      severity: "low",
      first_seen: "2026-01-30",
      modality_evidence: [
        { key: "rgb", label: "RGB ortho", attention: 0.55 },
        { key: "thermal", label: "Thermal", attention: 0.10 },
        { key: "lidar", label: "LiDAR", attention: 0.28 },
        { key: "gpr", label: "GPR", attention: 0.04 },
        { key: "acoustic", label: "Acoustic", attention: 0.03 },
      ],
      vlm:
        "Surface spall on the deck edge, well resolved by RGB and confirmed by LiDAR depth deviation of ~8 mm over a 40 mm patch. Thermal and GPR are uninformative at this geometry.",
      action:
        "Cosmetic; track for growth, no immediate action.",
      rul_years: 14.0,
    },
    {
      id: "D-006",
      angle_deg: 268,
      radius: 33,
      class: "crack",
      severity: "high",
      first_seen: "2025-05-12",
      modality_evidence: [
        { key: "rgb", label: "RGB ortho", attention: 0.40 },
        { key: "thermal", label: "Thermal", attention: 0.22 },
        { key: "lidar", label: "LiDAR", attention: 0.16 },
        { key: "gpr", label: "GPR", attention: 0.08 },
        { key: "acoustic", label: "Acoustic", attention: 0.14 },
      ],
      vlm:
        "Longitudinal crack approaching propagation threshold near the deck-to-pier interface. RGB resolves a width above the prior quarter's baseline; acoustic emission records two transient events within the last loading cycle co-located by beamforming.",
      action:
        "Elevate to monthly inspection cadence; instrument with a fibre-Bragg-grating strain sensor at the next maintenance window.",
      rul_years: 3.5,
    },
    {
      id: "D-007",
      angle_deg: 312,
      radius: 33,
      class: "corrosion",
      severity: "low",
      first_seen: "2026-02-18",
      modality_evidence: [
        { key: "rgb", label: "RGB ortho", attention: 0.34 },
        { key: "thermal", label: "Thermal", attention: 0.20 },
        { key: "lidar", label: "LiDAR", attention: 0.06 },
        { key: "gpr", label: "GPR", attention: 0.20 },
        { key: "acoustic", label: "Acoustic", attention: 0.20 },
      ],
      vlm:
        "Early-stage surface corrosion on a drainage scupper. Thermal anomaly confirms moisture pooling. No subsurface signature in GPR; acoustic background only.",
      action:
        "Route to drainage maintenance; re-evaluate at next quarterly pass.",
      rul_years: 11.0,
    },
    {
      id: "D-008",
      angle_deg: 340,
      radius: 33,
      class: "delam",
      severity: "medium",
      first_seen: "2025-12-03",
      modality_evidence: [
        { key: "rgb", label: "RGB ortho", attention: 0.08 },
        { key: "thermal", label: "Thermal", attention: 0.36 },
        { key: "lidar", label: "LiDAR", attention: 0.10 },
        { key: "gpr", label: "GPR", attention: 0.36 },
        { key: "acoustic", label: "Acoustic", attention: 0.10 },
      ],
      vlm:
        "Bounded delamination patch in the wearing course, picked up by thermal under solar load and corroborated by GPR amplitude attenuation at shallow depth.",
      action:
        "Tag for partial-depth patch repair at next planned closure.",
      rul_years: 7.0,
    },
  ];

  // Resolve each defect's coords from polar (angle, radius) to lng/lat
  const DEFECTS = DEFECTS_RAW.map((d) => {
    const a = (d.angle_deg * Math.PI) / 180;
    const coords = offset(CENTER, d.radius * Math.cos(a), d.radius * Math.sin(a));
    return { ...d, coords };
  });

  // Modality registry — drives the layer toggles + the pipeline-stage attribution
  const MODALITIES = {
    rgb:      { label: "RGB ortho",       stage: "rgb",      color: "#1f6feb", default: true  },
    thermal:  { label: "Thermal",         stage: "thermal",  color: "#dd6b20", default: false },
    lidar:    { label: "LiDAR",           stage: "lidar",    color: "#319795", default: false },
    gpr:      { label: "GPR",             stage: "gpr",      color: "#805ad5", default: false },
    acoustic: { label: "Acoustic",        stage: "acoustic", color: "#2f855a", default: false },
    fused:    { label: "Fused defects",   stage: "fusion",   color: "#c53030", default: true  },
    flight:   { label: "UAV flight path", stage: "acquisition", color: "#1a202c", default: true },
  };

  // Pre-compute geometry collections used by the map
  const GEOM = {
    bridge: ringPolygon(30, 36, 96),
    flight: flightPath(40, 26, 96),
    rgb: rgbFootprints(30, 36, 36),
    thermal: thermalField(DEFECTS),
    lidar: lidarPoints(30, 36, 380),
    gpr: gprLines(28, 38, 18),
    acoustic: acousticEvents(DEFECTS),
    defects: {
      type: "FeatureCollection",
      features: DEFECTS.map((d) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: d.coords },
        properties: { id: d.id, class: d.class, severity: d.severity },
      })),
    },
  };

  global.GISGAP_DATA = {
    CENTER,
    DEFECTS,
    MODALITIES,
    GEOM,
  };
})(window);
