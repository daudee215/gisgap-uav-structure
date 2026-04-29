/* gisgap-uav-structure — map, layers, pipeline highlight, defect evidence */

(function () {
  "use strict";

  const D = window.GISGAP_DATA;

  // ────────── Map init ──────────
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
    center: D.CENTER,
    zoom: 17.5,
    pitch: 35,
    bearing: -20,
    minZoom: 14,
    maxZoom: 21,
  });

  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
  map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");

  // Defect class → fill color (synced with style.css legend dots)
  const CLASS_COLORS = {
    crack: "#1f6feb",
    corrosion: "#b7791f",
    delam: "#805ad5",
    void: "#c53030",
    spall: "#2f855a",
  };

  // ────────── Layer registration ──────────
  map.on("load", () => {
    // Sources
    map.addSource("bridge", { type: "geojson", data: D.GEOM.bridge });
    map.addSource("flight", { type: "geojson", data: D.GEOM.flight });
    map.addSource("rgb", { type: "geojson", data: D.GEOM.rgb });
    map.addSource("thermal", { type: "geojson", data: D.GEOM.thermal });
    map.addSource("lidar", { type: "geojson", data: D.GEOM.lidar });
    map.addSource("gpr", { type: "geojson", data: D.GEOM.gpr });
    map.addSource("acoustic", { type: "geojson", data: D.GEOM.acoustic });
    map.addSource("defects", { type: "geojson", data: D.GEOM.defects });

    // Bridge outline (always visible — context).
    // Opacity bumped so the structure reads on first load over the basemap.
    map.addLayer({
      id: "bridge-fill",
      type: "fill",
      source: "bridge",
      paint: { "fill-color": "#1a202c", "fill-opacity": 0.34 },
    });
    map.addLayer({
      id: "bridge-outline",
      type: "line",
      source: "bridge",
      paint: { "line-color": "#1a202c", "line-width": 2.2 },
    });

    // RGB ortho mosaic (toggle: rgb).
    // Opacity dialled back + outline removed so the bridge polygon reads first.
    map.addLayer({
      id: "lyr-rgb",
      type: "fill",
      source: "rgb",
      layout: { visibility: D.MODALITIES.rgb.default ? "visible" : "none" },
      paint: {
        "fill-color": "#1f6feb",
        "fill-opacity": 0.06,
      },
    });

    // Thermal anomaly halos (toggle: thermal)
    map.addLayer({
      id: "lyr-thermal",
      type: "circle",
      source: "thermal",
      layout: { visibility: D.MODALITIES.thermal.default ? "visible" : "none" },
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["get", "intensity"], 0, 6, 1, 28],
        "circle-color": "#dd6b20",
        "circle-opacity": 0.35,
        "circle-blur": 0.8,
      },
    });

    // LiDAR coverage stipple (toggle: lidar)
    map.addLayer({
      id: "lyr-lidar",
      type: "circle",
      source: "lidar",
      layout: { visibility: D.MODALITIES.lidar.default ? "visible" : "none" },
      paint: {
        "circle-radius": 1.4,
        "circle-color": "#319795",
        "circle-opacity": 0.5,
      },
    });

    // GPR transects (toggle: gpr)
    map.addLayer({
      id: "lyr-gpr",
      type: "line",
      source: "gpr",
      layout: { visibility: D.MODALITIES.gpr.default ? "visible" : "none" },
      paint: {
        "line-color": "#805ad5",
        "line-width": 1.2,
        "line-dasharray": [2, 2],
        "line-opacity": 0.7,
      },
    });

    // Acoustic events (toggle: acoustic)
    map.addLayer({
      id: "lyr-acoustic",
      type: "circle",
      source: "acoustic",
      layout: { visibility: D.MODALITIES.acoustic.default ? "visible" : "none" },
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["get", "intensity"], 0, 4, 1, 14],
        "circle-color": "#2f855a",
        "circle-opacity": 0.55,
        "circle-stroke-color": "#fff",
        "circle-stroke-width": 1,
      },
    });

    // UAV flight path (toggle: flight)
    map.addLayer({
      id: "lyr-flight",
      type: "line",
      source: "flight",
      layout: { visibility: D.MODALITIES.flight.default ? "visible" : "none" },
      paint: {
        "line-color": "#1a202c",
        "line-width": 1.6,
        "line-dasharray": [4, 2],
        "line-opacity": 0.7,
      },
    });

    // Fused defect markers (toggle: fused) — also clickable
    map.addLayer({
      id: "lyr-defects",
      type: "circle",
      source: "defects",
      layout: { visibility: D.MODALITIES.fused.default ? "visible" : "none" },
      paint: {
        "circle-radius": [
          "match",
          ["get", "severity"],
          "high", 9,
          "medium", 7,
          "low", 5,
          6,
        ],
        "circle-color": [
          "match",
          ["get", "class"],
          "crack", CLASS_COLORS.crack,
          "corrosion", CLASS_COLORS.corrosion,
          "delam", CLASS_COLORS.delam,
          "void", CLASS_COLORS.void,
          "spall", CLASS_COLORS.spall,
          "#888",
        ],
        "circle-stroke-color": "#fff",
        "circle-stroke-width": 2,
        "circle-opacity": 0.95,
      },
    });

    // ────────── Layer-toggle UI ──────────
    const layerList = document.getElementById("layer-list");
    Object.entries(D.MODALITIES).forEach(([key, mod]) => {
      const li = document.createElement("li");
      const id = `tog-${key}`;
      li.innerHTML = `
        <input type="checkbox" id="${id}" ${mod.default ? "checked" : ""}>
        <span class="layer-swatch" style="background:${mod.color}"></span>
        <label for="${id}">${mod.label}</label>
      `;
      layerList.appendChild(li);

      const cb = li.querySelector("input");
      cb.addEventListener("change", () => {
        const lid = key === "fused" ? "lyr-defects" : `lyr-${key}`;
        map.setLayoutProperty(lid, "visibility", cb.checked ? "visible" : "none");
        if (cb.checked) highlightStage(mod.stage);
      });
    });

    // ────────── Defect click ──────────
    map.on("click", "lyr-defects", (e) => {
      if (!e.features?.length) return;
      const id = e.features[0].properties.id;
      const defect = D.DEFECTS.find((d) => d.id === id);
      if (defect) renderEvidence(defect);
    });
    map.on("mouseenter", "lyr-defects", () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", "lyr-defects", () => (map.getCanvas().style.cursor = ""));

    // Default highlight: fusion stage (the layer that's on by default)
    highlightStage("fusion");
  });

  // ────────── Pipeline ↔ Layer wiring ──────────
  const pipelineEl = document.getElementById("pipeline");
  const STAGE_TO_LAYER = {
    acquisition: "lyr-flight",
    rgb: "lyr-rgb",
    thermal: "lyr-thermal",
    lidar: "lyr-lidar",
    gpr: "lyr-gpr",
    acoustic: "lyr-acoustic",
    fusion: "lyr-defects",
    defects: "lyr-defects",
    rul: null,
    edge: null,
  };

  function highlightStage(stage) {
    document.querySelectorAll(".pipe-stage").forEach((el) => {
      el.classList.toggle("is-active", el.dataset.stage === stage);
    });
  }

  pipelineEl.addEventListener("click", (e) => {
    const li = e.target.closest(".pipe-stage");
    if (!li) return;
    const stage = li.dataset.stage;
    highlightStage(stage);

    const lid = STAGE_TO_LAYER[stage];
    if (!lid || !map.getLayer(lid)) return;

    // Turn the corresponding layer ON
    map.setLayoutProperty(lid, "visibility", "visible");
    const togKey = stage === "acquisition" ? "flight"
                 : stage === "fusion" || stage === "defects" ? "fused"
                 : stage;
    const cb = document.getElementById(`tog-${togKey}`);
    if (cb) cb.checked = true;
  });

  // ────────── Evidence panel ──────────
  const empty = document.getElementById("evidence-empty");
  const card = document.getElementById("evidence-card");

  function renderEvidence(d) {
    empty.hidden = true;
    card.hidden = false;

    const classLabel = {
      crack: "Crack",
      corrosion: "Corrosion",
      delam: "Delamination",
      void: "Void / internal",
      spall: "Spalling",
    }[d.class] || d.class;

    const classBadge = document.getElementById("ev-class");
    classBadge.textContent = classLabel;
    classBadge.className = "evidence-class " + d.class;

    document.getElementById("ev-id").textContent = d.id;
    document.getElementById("ev-severity").textContent = d.severity;
    document.getElementById("ev-location").textContent =
      `${d.coords[1].toFixed(5)}, ${d.coords[0].toFixed(5)}`;
    document.getElementById("ev-first-seen").textContent = d.first_seen;

    // Modality bars (sorted by attention desc)
    const mods = [...d.modality_evidence].sort((a, b) => b.attention - a.attention);
    const ul = document.getElementById("ev-modalities");
    ul.innerHTML = mods
      .map(
        (m) => `
      <li>
        <span class="mb-name">${m.label}</span>
        <span class="mb-bar"><span class="mb-fill" style="width:${(m.attention * 100).toFixed(0)}%"></span></span>
        <span class="mb-val">${(m.attention * 100).toFixed(0)}%</span>
      </li>`
      )
      .join("");

    document.getElementById("ev-vlm").textContent = d.vlm;
    document.getElementById("ev-action").textContent = d.action;

    drawRulCurve(d.rul_years, d.severity);
    document.getElementById("ev-rul-caption").textContent =
      `RUL estimate: ${d.rul_years.toFixed(1)} years (synthetic Bayesian state-space output, 80% CI shown)`;

    // Highlight the dominant modality stage
    const dominant = mods[0];
    if (dominant && D.MODALITIES[dominant.key]) {
      highlightStage(D.MODALITIES[dominant.key].stage);
    }
  }

  // Synthetic RUL curve as SVG
  function drawRulCurve(rulYears, severity) {
    const svg = document.getElementById("ev-rul");
    const W = 280, H = 100, padL = 30, padR = 8, padT = 10, padB = 22;
    const horizon = Math.max(rulYears * 1.4, 6);
    const decay = Math.log(2) / Math.max(rulYears, 1);
    const baseRisk = severity === "high" ? 0.35 : severity === "medium" ? 0.18 : 0.08;

    const xs = [];
    const ys = [];
    const upper = [];
    const lower = [];
    for (let i = 0; i <= 60; i++) {
      const t = (i / 60) * horizon;
      const r = 1 - (1 - baseRisk) * Math.exp(-decay * t);
      const sd = 0.05 + 0.02 * t;
      xs.push(t);
      ys.push(r);
      upper.push(Math.min(1, r + sd));
      lower.push(Math.max(0, r - sd));
    }
    const xScale = (t) => padL + (t / horizon) * (W - padL - padR);
    const yScale = (r) => padT + (1 - r) * (H - padT - padB);

    const linePath =
      "M " +
      xs.map((t, i) => `${xScale(t).toFixed(1)},${yScale(ys[i]).toFixed(1)}`).join(" L ");

    const bandPath =
      "M " +
      xs.map((t, i) => `${xScale(t).toFixed(1)},${yScale(upper[i]).toFixed(1)}`).join(" L ") +
      " L " +
      xs
        .slice()
        .reverse()
        .map((t, i) => {
          const idx = xs.length - 1 - i;
          return `${xScale(t).toFixed(1)},${yScale(lower[idx]).toFixed(1)}`;
        })
        .join(" L ") +
      " Z";

    // Action threshold line (risk = 0.5)
    const threshY = yScale(0.5);
    const rulX = xScale(rulYears);

    svg.innerHTML = `
      <g font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif" font-size="9" fill="#718096">
        <text x="2" y="${padT + 4}">risk</text>
        <text x="2" y="${H - padB + 12}">0</text>
        <text x="2" y="${padT + 8}" text-anchor="start">1</text>
        <text x="${W - padR}" y="${H - padB + 14}" text-anchor="end">years</text>
        <text x="${padL - 4}" y="${H - padB + 14}" text-anchor="end">0</text>
        <text x="${W - padR}" y="${H - padB + 14}" text-anchor="end">${horizon.toFixed(0)}</text>
      </g>
      <line x1="${padL}" y1="${H - padB}" x2="${W - padR}" y2="${H - padB}" stroke="#cbd5e0" stroke-width="1"/>
      <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${H - padB}" stroke="#cbd5e0" stroke-width="1"/>

      <line x1="${padL}" y1="${threshY}" x2="${W - padR}" y2="${threshY}" stroke="#dd6b20" stroke-width="0.8" stroke-dasharray="3 3"/>
      <text x="${W - padR - 2}" y="${threshY - 3}" text-anchor="end" font-size="9" fill="#dd6b20">action threshold</text>

      <path d="${bandPath}" fill="#2b6cb0" fill-opacity="0.15"/>
      <path d="${linePath}" fill="none" stroke="#2b6cb0" stroke-width="1.6"/>

      <line x1="${rulX}" y1="${padT}" x2="${rulX}" y2="${H - padB}" stroke="#c53030" stroke-width="0.8"/>
      <circle cx="${rulX}" cy="${yScale(0.5)}" r="3" fill="#c53030"/>
    `;
  }
})();
