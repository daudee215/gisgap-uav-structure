/* gisgap-uav-structure — map, layers, pipeline highlight, defect evidence  v2
   Changes from v1:
     - X-ray backscatter layer (lyr-xray)
     - Hover popup on defect markers (class · severity · ID)
     - Severity filter (All / High+Med / High only)
     - Defect count badges per class in legend
     - Reset view button in map controls
     - Evidence panel auto-scrolls to top on new defect
     - Keyboard navigation (↑ ↓) through pipeline stages
     - Confidence badge and delta-severity warning in evidence header
     - Area and confidence added to evidence metadata grid
     - Uncertainty (±σ) overlay on modality attention bars
     - Coverage stats panel at bottom of pipeline sidebar
     - Null-checked layer operations; graceful degradation if map not ready
*/

(function () {
  "use strict";

  const D = window.GISGAP_DATA;

  // ────────── Map init ──────────
  const INITIAL_VIEW = { center: D.CENTER, zoom: 17.5, pitch: 35, bearing: -20 };

  const map = new maplibregl.Map({
    container: "map",
    style: {
      version: 8,
      sources: {
        osm: {
          type: "raster",
          tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
          tileSize: 256,
          attribution: "© OpenStreetMap contributors",
          maxzoom: 19,
        },
      },
      layers: [{ id: "osm", type: "raster", source: "osm" }],
    },
    ...INITIAL_VIEW,
    minZoom: 14,
    maxZoom: 21,
  });

  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
  map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");

  // Defect class → fill colour (synced with style.css legend dots)
  const CLASS_COLORS = {
    crack:     "#1f6feb",
    corrosion: "#b7791f",
    delam:     "#805ad5",
    void:      "#c53030",
    spall:     "#2f855a",
  };

  const CLASS_LABELS = {
    crack:     "Crack",
    corrosion: "Corrosion",
    delam:     "Delamination",
    void:      "Void / internal",
    spall:     "Spalling",
  };

  // ────────── Hover popup ──────────
  const hoverPopup = new maplibregl.Popup({
    closeButton: false,
    closeOnClick: false,
    offset: 12,
    className: "defect-hover-popup",
  });

  // ────────── Layer registration ──────────
  map.on("load", () => {

    // Sources
    map.addSource("bridge",   { type: "geojson", data: D.GEOM.bridge });
    map.addSource("flight",   { type: "geojson", data: D.GEOM.flight });
    map.addSource("rgb",      { type: "geojson", data: D.GEOM.rgb });
    map.addSource("thermal",  { type: "geojson", data: D.GEOM.thermal });
    map.addSource("lidar",    { type: "geojson", data: D.GEOM.lidar });
    map.addSource("gpr",      { type: "geojson", data: D.GEOM.gpr });
    map.addSource("acoustic", { type: "geojson", data: D.GEOM.acoustic });
    map.addSource("xray",     { type: "geojson", data: D.GEOM.xray });
    map.addSource("defects",  { type: "geojson", data: D.GEOM.defects });

    // Bridge outline (always visible)
    map.addLayer({ id: "bridge-fill",    type: "fill",   source: "bridge", paint: { "fill-color": "#1a202c", "fill-opacity": 0.34 } });
    map.addLayer({ id: "bridge-outline", type: "line",   source: "bridge", paint: { "line-color": "#1a202c", "line-width": 2.2 } });

    // RGB ortho footprints
    map.addLayer({
      id: "lyr-rgb", type: "fill", source: "rgb",
      layout: { visibility: D.MODALITIES.rgb.default ? "visible" : "none" },
      paint: { "fill-color": "#1f6feb", "fill-opacity": 0.06 },
    });

    // Thermal anomaly halos
    map.addLayer({
      id: "lyr-thermal", type: "circle", source: "thermal",
      layout: { visibility: D.MODALITIES.thermal.default ? "visible" : "none" },
      paint: {
        "circle-radius":  ["interpolate", ["linear"], ["get", "intensity"], 0, 6, 1, 28],
        "circle-color":   "#dd6b20",
        "circle-opacity": 0.35,
        "circle-blur":    0.8,
      },
    });

    // LiDAR coverage stipple
    map.addLayer({
      id: "lyr-lidar", type: "circle", source: "lidar",
      layout: { visibility: D.MODALITIES.lidar.default ? "visible" : "none" },
      paint: { "circle-radius": 1.4, "circle-color": "#319795", "circle-opacity": 0.5 },
    });

    // GPR traverses
    map.addLayer({
      id: "lyr-gpr", type: "line", source: "gpr",
      layout: { visibility: D.MODALITIES.gpr.default ? "visible" : "none" },
      paint: { "line-color": "#805ad5", "line-width": 1.2, "line-dasharray": [2, 2], "line-opacity": 0.7 },
    });

    // Acoustic emission events
    map.addLayer({
      id: "lyr-acoustic", type: "circle", source: "acoustic",
      layout: { visibility: D.MODALITIES.acoustic.default ? "visible" : "none" },
      paint: {
        "circle-radius":       ["interpolate", ["linear"], ["get", "intensity"], 0, 4, 1, 14],
        "circle-color":        "#2f855a",
        "circle-opacity":      0.55,
        "circle-stroke-color": "#fff",
        "circle-stroke-width": 1,
      },
    });

    // X-ray backscatter scan strips
    map.addLayer({
      id: "lyr-xray", type: "fill", source: "xray",
      layout: { visibility: D.MODALITIES.xray.default ? "visible" : "none" },
      paint: { "fill-color": "#e53e3e", "fill-opacity": 0.10 },
    });
    map.addLayer({
      id: "lyr-xray-outline", type: "line", source: "xray",
      layout: { visibility: D.MODALITIES.xray.default ? "visible" : "none" },
      paint: { "line-color": "#e53e3e", "line-width": 1.0, "line-dasharray": [3, 2], "line-opacity": 0.55 },
    });

    // UAV flight path
    map.addLayer({
      id: "lyr-flight", type: "line", source: "flight",
      layout: { visibility: D.MODALITIES.flight.default ? "visible" : "none" },
      paint: { "line-color": "#1a202c", "line-width": 1.6, "line-dasharray": [4, 2], "line-opacity": 0.7 },
    });

    // Fused defect markers
    map.addLayer({
      id: "lyr-defects", type: "circle", source: "defects",
      layout: { visibility: D.MODALITIES.fused.default ? "visible" : "none" },
      paint: {
        "circle-radius": ["match", ["get", "severity"], "high", 10, "medium", 7.5, "low", 5.5, 7],
        "circle-color": [
          "match", ["get", "class"],
          "crack",     CLASS_COLORS.crack,
          "corrosion", CLASS_COLORS.corrosion,
          "delam",     CLASS_COLORS.delam,
          "void",      CLASS_COLORS.void,
          "spall",     CLASS_COLORS.spall,
          "#888",
        ],
        "circle-stroke-color": [
          "case", ["==", ["get", "delta_severity"], 1], "#f6ad55", "#fff"
        ],
        "circle-stroke-width": [
          "case", ["==", ["get", "delta_severity"], 1], 2.5, 2
        ],
        "circle-opacity": 0.95,
      },
    });

    // ────────── Build layer-toggle UI ──────────
    buildLayerToggles();

    // ────────── Defect interactions ──────────
    map.on("click", "lyr-defects", e => {
      if (!e.features?.length) return;
      const id = e.features[0].properties.id;
      const defect = D.DEFECTS.find(d => d.id === id);
      if (defect) renderEvidence(defect);
    });

    map.on("mouseenter", "lyr-defects", e => {
      if (!e.features?.length) return;
      map.getCanvas().style.cursor = "pointer";
      const p = e.features[0].properties;
      const defect = D.DEFECTS.find(d => d.id === p.id);
      if (!defect) return;
      hoverPopup
        .setLngLat(defect.coords)
        .setHTML(
          `<span class="popup-id">${p.id}</span>` +
          `<span class="popup-class ${p.class}">${CLASS_LABELS[p.class] || p.class}</span>` +
          `<span class="popup-sev popup-sev-${p.severity}">${p.severity}</span>`
        )
        .addTo(map);
    });

    map.on("mouseleave", "lyr-defects", () => {
      map.getCanvas().style.cursor = "";
      hoverPopup.remove();
    });

    // Default highlight
    highlightStage("fusion");

    // Coverage stats in sidebar footer
    renderCoverageStats();
  });

  // ────────── Layer-toggle UI ──────────
  function buildLayerToggles() {
    const layerList = document.getElementById("layer-list");

    // Count defects per class for legend badges
    const classCounts = {};
    D.DEFECTS.forEach(d => { classCounts[d.class] = (classCounts[d.class] || 0) + 1; });

    Object.entries(D.MODALITIES).forEach(([key, mod]) => {
      const li = document.createElement("li");
      const id = `tog-${key}`;

      // For fused layer: append class count badges
      const extraHtml = key === "fused"
        ? `<span class="layer-counts">${
            Object.entries(classCounts)
              .map(([cls, n]) => `<span class="cls-badge cls-${cls}" title="${CLASS_LABELS[cls]}">${n}</span>`)
              .join("")
          }</span>`
        : "";

      li.innerHTML =
        `<input type="checkbox" id="${id}" ${mod.default ? "checked" : ""}>` +
        `<span class="layer-swatch" style="background:${mod.color}"></span>` +
        `<label for="${id}">${mod.label}</label>` +
        extraHtml;

      layerList.appendChild(li);

      const cb = li.querySelector("input");
      cb.addEventListener("change", () => {
        setLayerVisibility(key, cb.checked);
        if (cb.checked) highlightStage(mod.stage);
      });
    });
  }

  function setLayerVisibility(key, visible) {
    const vis = visible ? "visible" : "none";
    const layerId = key === "fused" ? "lyr-defects"
                  : key === "xray"  ? "lyr-xray"
                  : `lyr-${key}`;
    if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", vis);
    // X-ray has an outline companion layer
    if (key === "xray" && map.getLayer("lyr-xray-outline")) {
      map.setLayoutProperty("lyr-xray-outline", "visibility", vis);
    }
  }

  // ────────── Severity filter ──────────
  document.getElementById("severity-filter").addEventListener("change", e => {
    const val = e.target.value;
    let filter = null;
    if (val === "high")     filter = ["==", ["get", "severity"], "high"];
    if (val === "high-med") filter = ["in", ["get", "severity"], ["literal", ["high", "medium"]]];
    if (map.getLayer("lyr-defects")) map.setFilter("lyr-defects", filter);
  });

  // ────────── Reset view ──────────
  document.getElementById("btn-reset-view").addEventListener("click", () => {
    map.flyTo({ ...INITIAL_VIEW, duration: 900, essential: true });
  });

  // ────────── Pipeline ↔ Layer wiring ──────────
  const STAGE_ORDER = [
    "acquisition", "rgb", "thermal", "lidar", "gpr", "acoustic", "xray",
    "fusion", "defects", "rul", "edge",
  ];

  const STAGE_TO_LAYER = {
    acquisition: "lyr-flight",
    rgb:         "lyr-rgb",
    thermal:     "lyr-thermal",
    lidar:       "lyr-lidar",
    gpr:         "lyr-gpr",
    acoustic:    "lyr-acoustic",
    xray:        "lyr-xray",
    fusion:      "lyr-defects",
    defects:     "lyr-defects",
    rul:         null,
    edge:        null,
  };

  let activeStageIdx = STAGE_ORDER.indexOf("fusion");

  function highlightStage(stage) {
    document.querySelectorAll(".pipe-stage").forEach(el => {
      el.classList.toggle("is-active", el.dataset.stage === stage);
    });
    const idx = STAGE_ORDER.indexOf(stage);
    if (idx >= 0) activeStageIdx = idx;
    // Scroll active stage into view within the sidebar list
    const activeEl = document.querySelector(`.pipe-stage[data-stage="${stage}"]`);
    if (activeEl) activeEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  document.getElementById("pipeline").addEventListener("click", e => {
    const li = e.target.closest(".pipe-stage");
    if (!li) return;
    const stage = li.dataset.stage;
    highlightStage(stage);
    const lid = STAGE_TO_LAYER[stage];
    if (!lid || !map.getLayer(lid)) return;
    map.setLayoutProperty(lid, "visibility", "visible");
    if (stage === "xray" && map.getLayer("lyr-xray-outline")) {
      map.setLayoutProperty("lyr-xray-outline", "visibility", "visible");
    }
    // Sync checkbox
    const togKey = stage === "acquisition" ? "flight"
                 : (stage === "fusion" || stage === "defects") ? "fused"
                 : stage;
    const cb = document.getElementById(`tog-${togKey}`);
    if (cb) cb.checked = true;
  });

  // ────────── Keyboard navigation ──────────
  document.addEventListener("keydown", e => {
    // Don't capture when typing in inputs
    if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      activeStageIdx = Math.min(activeStageIdx + 1, STAGE_ORDER.length - 1);
      triggerStageByIdx(activeStageIdx);
      e.preventDefault();
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      activeStageIdx = Math.max(activeStageIdx - 1, 0);
      triggerStageByIdx(activeStageIdx);
      e.preventDefault();
    }
  });

  function triggerStageByIdx(idx) {
    const stage = STAGE_ORDER[idx];
    highlightStage(stage);
    const lid = STAGE_TO_LAYER[stage];
    if (lid && map.getLayer(lid)) {
      map.setLayoutProperty(lid, "visibility", "visible");
      if (stage === "xray" && map.getLayer("lyr-xray-outline")) {
        map.setLayoutProperty("lyr-xray-outline", "visibility", "visible");
      }
      const togKey = stage === "acquisition" ? "flight"
                   : (stage === "fusion" || stage === "defects") ? "fused"
                   : stage;
      const cb = document.getElementById(`tog-${togKey}`);
      if (cb) cb.checked = true;
    }
  }

  // ────────── Coverage stats panel ──────────
  function renderCoverageStats() {
    const container = document.getElementById("coverage-stats");
    if (!container || !D.INSPECTION) return;
    const cov = D.INSPECTION.coverage_pct;
    const modKeys = ["rgb", "thermal", "lidar", "gpr", "acoustic", "xray"];
    container.innerHTML = modKeys.map(key => {
      const pct = cov[key] ?? 0;
      const col = D.MODALITIES[key]?.color ?? "#888";
      return `
        <div class="cov-row">
          <span class="cov-name">${D.MODALITIES[key]?.label ?? key}</span>
          <span class="cov-bar"><span class="cov-fill" style="width:${pct}%;background:${col}"></span></span>
          <span class="cov-val">${pct}%</span>
        </div>`;
    }).join("");
  }

  // ────────── Evidence panel ──────────
  const evidenceEmpty = document.getElementById("evidence-empty");
  const evidenceCard  = document.getElementById("evidence-card");
  const evidenceScroll = document.getElementById("evidence-scroll");

  function renderEvidence(d) {
    evidenceEmpty.hidden = true;
    evidenceCard.hidden  = false;

    // Scroll to top
    if (evidenceScroll) evidenceScroll.scrollTop = 0;

    const classLabel = CLASS_LABELS[d.class] || d.class;
    const classBadge = document.getElementById("ev-class");
    classBadge.textContent = classLabel;
    classBadge.className   = `evidence-class ${d.class}`;

    document.getElementById("ev-id").textContent = d.id;

    // Confidence badge
    const confBadge = document.getElementById("ev-confidence");
    if (confBadge) {
      confBadge.textContent = `${Math.round((d.confidence ?? 0) * 100)}% conf`;
      confBadge.className = `confidence-badge conf-${d.confidence >= 0.9 ? "high" : d.confidence >= 0.75 ? "med" : "low"}`;
    }

    // Delta-severity warning
    const deltaBadge = document.getElementById("ev-delta");
    if (deltaBadge) {
      deltaBadge.hidden = !d.delta_severity;
      deltaBadge.textContent = "▲ Worsening";
    }

    // Metadata grid
    document.getElementById("ev-severity").textContent  = d.severity;
    document.getElementById("ev-location").textContent  =
      `${d.coords[1].toFixed(5)}, ${d.coords[0].toFixed(5)}`;
    document.getElementById("ev-first-seen").textContent = d.first_seen;
    const areaEl = document.getElementById("ev-area");
    if (areaEl) areaEl.textContent = d.area_mm2 != null
      ? `${d.area_mm2 >= 10000 ? (d.area_mm2 / 1e6).toFixed(3) + " m²" : d.area_mm2 + " mm²"}`
      : "—";

    // Modality bars — sorted by attention descending, with ±σ overlay
    const mods = [...d.modality_evidence].sort((a, b) => b.attention - a.attention);
    const ul = document.getElementById("ev-modalities");
    ul.innerHTML = mods.map(m => {
      const pct  = (m.attention * 100).toFixed(0);
      const sLo  = Math.max(0, m.attention - (m.sigma ?? 0)) * 100;
      const sHi  = Math.min(1, m.attention + (m.sigma ?? 0)) * 100;
      const col  = D.MODALITIES[m.key]?.color ?? "#888";
      return `
        <li>
          <span class="mb-name">${m.label}</span>
          <span class="mb-bar">
            <span class="mb-fill" style="width:${pct}%;background:${col}"></span>
            <span class="mb-uncertainty" style="left:${sLo.toFixed(1)}%;width:${(sHi - sLo).toFixed(1)}%"></span>
          </span>
          <span class="mb-val">${pct}%</span>
        </li>`;
    }).join("");

    // VLM statement
    document.getElementById("ev-vlm").textContent = d.vlm;

    // Recommended action
    document.getElementById("ev-action").textContent = d.action;

    // RUL chart
    drawRulCurve(d.rul_years, d.severity);
    document.getElementById("ev-rul-caption").textContent =
      `RUL estimate: ${d.rul_years.toFixed(1)} years · synthetic Bayesian state-space · 80% CI shown`;

    // Highlight dominant modality stage
    const dominant = mods[0];
    if (dominant && D.MODALITIES[dominant.key]) {
      highlightStage(D.MODALITIES[dominant.key].stage);
    }
  }

  // ────────── RUL chart ──────────
  function drawRulCurve(rulYears, severity) {
    const svg = document.getElementById("ev-rul");
    const W = 280, H = 108;
    const padL = 34, padR = 10, padT = 12, padB = 26;
    const horizon = Math.max(rulYears * 1.5, 6);
    const decay   = Math.log(2) / Math.max(rulYears, 0.5);
    const baseRisk = severity === "high" ? 0.35 : severity === "medium" ? 0.18 : 0.08;

    const xs = [], ys = [], upper = [], lower = [];
    for (let i = 0; i <= 80; i++) {
      const t = (i / 80) * horizon;
      const r = 1 - (1 - baseRisk) * Math.exp(-decay * t);
      const sd = 0.04 + 0.018 * t;
      xs.push(t);
      ys.push(r);
      upper.push(Math.min(1, r + sd));
      lower.push(Math.max(0, r - sd));
    }

    const xS = t  => padL + (t / horizon) * (W - padL - padR);
    const yS = r  => padT + (1 - r) * (H - padT - padB);

    const linePath = "M " + xs.map((t, i) => `${xS(t).toFixed(1)},${yS(ys[i]).toFixed(1)}`).join(" L ");
    const bandPath =
      "M " + xs.map((t, i) => `${xS(t).toFixed(1)},${yS(upper[i]).toFixed(1)}`).join(" L ") +
      " L " + xs.slice().reverse().map((t, i) => {
        const idx = xs.length - 1 - i;
        return `${xS(t).toFixed(1)},${yS(lower[idx]).toFixed(1)}`;
      }).join(" L ") + " Z";

    const threshY = yS(0.5);
    const rulX    = xS(rulYears);

    // Y-axis tick values
    const yTicks = [0, 0.25, 0.5, 0.75, 1.0];
    const yTickMarks = yTicks.map(v =>
      `<line x1="${padL - 4}" y1="${yS(v).toFixed(1)}" x2="${padL}" y2="${yS(v).toFixed(1)}" stroke="#cbd5e0" stroke-width="1"/>` +
      `<text x="${padL - 6}" y="${(yS(v) + 3).toFixed(1)}" text-anchor="end" font-size="8" fill="#718096">${v === 0 ? "0" : v === 1 ? "1" : v}</text>`
    ).join("");

    // X-axis ticks
    const xStep  = horizon <= 8 ? 2 : horizon <= 16 ? 4 : 6;
    const xTicks = [];
    for (let t = 0; t <= horizon; t += xStep) xTicks.push(t);
    const xTickMarks = xTicks.map(t =>
      `<line x1="${xS(t).toFixed(1)}" y1="${H - padB}" x2="${xS(t).toFixed(1)}" y2="${H - padB + 4}" stroke="#cbd5e0" stroke-width="1"/>` +
      `<text x="${xS(t).toFixed(1)}" y="${H - padB + 13}" text-anchor="middle" font-size="8" fill="#718096">${t}</text>`
    ).join("");

    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.innerHTML = `
      <g font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
        <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${H - padB}" stroke="#e2e8f0" stroke-width="1"/>
        <line x1="${padL}" y1="${H - padB}" x2="${W - padR}" y2="${H - padB}" stroke="#e2e8f0" stroke-width="1"/>
        ${yTickMarks}
        ${xTickMarks}
        <text x="${padL - 2}" y="${padT - 3}" font-size="8" fill="#a0aec0">risk</text>
        <text x="${W - padR}" y="${H - padB + 22}" text-anchor="end" font-size="8" fill="#a0aec0">years</text>

        <line x1="${padL}" y1="${threshY.toFixed(1)}" x2="${W - padR}" y2="${threshY.toFixed(1)}"
              stroke="#dd6b20" stroke-width="0.8" stroke-dasharray="3 3"/>
        <text x="${W - padR - 2}" y="${(threshY - 3).toFixed(1)}" text-anchor="end"
              font-size="8" fill="#dd6b20">action threshold</text>

        <path d="${bandPath}" fill="#2b6cb0" fill-opacity="0.13"/>
        <path d="${linePath}" fill="none" stroke="#2b6cb0" stroke-width="1.8"/>

        <line x1="${rulX.toFixed(1)}" y1="${padT}" x2="${rulX.toFixed(1)}" y2="${H - padB}"
              stroke="#c53030" stroke-width="0.9" stroke-dasharray="2 2"/>
        <circle cx="${rulX.toFixed(1)}" cy="${threshY.toFixed(1)}" r="3.5" fill="#c53030"/>
        <text x="${(rulX + 3).toFixed(1)}" y="${(threshY - 4).toFixed(1)}"
              font-size="7.5" fill="#c53030">${rulYears.toFixed(1)} yr</text>
      </g>`;
  }
})();
