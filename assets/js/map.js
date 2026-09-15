document.addEventListener("DOMContentLoaded", () => {
  const mapElement = document.querySelector("#campus-map");
  const mapMessage = document.querySelector("[data-map-message]");
  if (!mapElement || typeof L === "undefined" || typeof Papa === "undefined" || typeof CARTO_API_KEY !== "string" || !CARTO_API_KEY) {
    console.error("The map libraries could not be loaded.");
    if (mapMessage) {
      mapMessage.textContent = "Response data could not be loaded.";
      mapMessage.hidden = false;
    }
    return;
  }

  const DEFAULT_VIEW = [1.2966, 103.7764];
  const DEFAULT_ZOOM = 15;
  const categoryButtons = [...document.querySelectorAll("[data-category-filter]")];
  const tradeButtons = [...document.querySelectorAll("[data-trade-filter]")];
  const clearTradeButton = document.querySelector("[data-clear-trade-filter]");
  const resultCount = document.querySelector("[data-result-count]");
  let activeCategory = "all";
  let activeTradeFilter = "";
  let observations = [];

  const map = L.map(mapElement, { scrollWheelZoom: false }).setView(DEFAULT_VIEW, DEFAULT_ZOOM);
  const cartoTileUrl = `https://{s}.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}.png?key=${encodeURIComponent(CARTO_API_KEY)}`;
  L.tileLayer(cartoTileUrl, {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: "abcd",
    maxZoom: 20
  }).addTo(map);
  const markerLayer = L.layerGroup().addTo(map);

  function escapeHtml(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  function field(row, name) { return (row[name] ?? "").trim(); }

  function score(value) {
    const match = String(value ?? "").match(/^\s*([1-5])\b/);
    return match ? Number(match[1]) : null;
  }

  function categoryKey(type) {
    const normalized = type.toLowerCase();
    return ["noise", "air", "water"].includes(normalized) ? normalized : "other";
  }

  function isPriorityIntervention(observation) {
    const response = observation.response.toLowerCase();
    return response === "remove the source" || response === "relocate or redesign the source" ||
      (observation.burdenScore !== null && observation.valueScore !== null && observation.burdenScore >= 4 && observation.valueScore <= 2);
  }

  function createObservation(row) {
    const latitude = Number.parseFloat(field(row, "lat"));
    const longitude = Number.parseFloat(field(row, "lon"));
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

    const intensity = field(row, "intensity");
    const disruption = field(row, "disruption");
    const campusValue = field(row, "campus_value");
    const intensityScore = score(intensity);
    const disruptionScore = score(disruption);
    const valueScore = score(campusValue);
    const type = field(row, "pollution_type");

    return {
      latitude, longitude, type, category: categoryKey(type),
      title: field(row, "title"), notice: field(row, "description"), source: field(row, "source"), dataType: field(row, "data_type") || "Real", intensity,
      frequency: field(row, "frequency"), disruption, campusValue,
      response: field(row, "preferred_response"), intensityScore, disruptionScore, valueScore,
      burdenScore: intensityScore !== null && disruptionScore !== null ? (intensityScore + disruptionScore) / 2 : null
    };
  }

  function markerIcon(category, dataType) {
    const markerClass = ["noise", "air", "water"].includes(category) ? category : "noise";
    const hypotheticalClass = dataType.toLowerCase() === "hypothetical" ? " observation-marker--hypothetical" : "";
    const shapes = {
      noise: '<circle class="marker-shape" cx="11" cy="11" r="8"></circle>',
      air: '<path class="marker-shape" d="M11 2 L20 11 L11 20 L2 11 Z"></path>',
      water: '<path class="marker-shape" d="M11 2 L20 19 L2 19 Z"></path>'
    };
    const outlines = {
      noise: '<circle class="marker-provenance-outline" cx="11" cy="11" r="9.5"></circle>',
      air: '<path class="marker-provenance-outline" d="M11 2 L20 11 L11 20 L2 11 Z"></path>',
      water: '<path class="marker-provenance-outline" d="M11 2 L20 19 L2 19 Z"></path>'
    };
    const outline = hypotheticalClass ? outlines[markerClass] : "";
    return L.divIcon({ className: `observation-marker observation-marker--${markerClass}${hypotheticalClass}`, html: `<svg viewBox="0 0 22 22" aria-hidden="true">${shapes[markerClass]}${outline}</svg>`, iconSize: [22, 22], iconAnchor: [11, 11], popupAnchor: [0, -15] });
  }

  function popupField(label, value) {
    return value ? `<div class="popup-field"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>` : "";
  }

  function popupContent(observation) {
    const dataType = observation.dataType.toLowerCase() === "hypothetical" ? "Hypothetical" : "Real";
    const dataTypeLabel = dataType === "Hypothetical" ? "Hypothetical" : "Real submission";
    return `<article class="map-popup"><p class="map-data-type map-data-type--${dataType.toLowerCase()}">${escapeHtml(dataTypeLabel)}</p>${observation.title ? `<h2>${escapeHtml(observation.title)}</h2>` : ""}<dl class="popup-fields">${popupField("Pollution type", observation.type)}${popupField("Likely source", observation.source)}${popupField("Intensity", observation.intensity)}${popupField("Frequency", observation.frequency)}${popupField("Disruption", observation.disruption)}${popupField("Campus value", observation.campusValue)}${popupField("Preferred response", observation.response)}</dl>${observation.notice ? `<p class="popup-description">${escapeHtml(observation.notice)}</p>` : ""}</article>`;
  }

  function matchesFilters(observation) {
    if (activeCategory !== "all" && observation.category !== activeCategory) return false;
    if (activeTradeFilter === "burden") return observation.burdenScore !== null && observation.burdenScore >= 3.5;
    if (activeTradeFilter === "value") return observation.valueScore !== null && observation.valueScore >= 4;
    if (activeTradeFilter === "priority") return isPriorityIntervention(observation);
    return true;
  }

  function updateControls() {
    categoryButtons.forEach((button) => {
      const selected = button.dataset.categoryFilter === activeCategory;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    tradeButtons.forEach((button) => {
      const selected = button.dataset.tradeFilter === activeTradeFilter;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    clearTradeButton.hidden = !activeTradeFilter;
  }

  function showMessage(message) { mapMessage.textContent = message; mapMessage.hidden = false; }
  function clearMessage() { mapMessage.hidden = true; mapMessage.textContent = ""; }

  function renderMarkers() {
    markerLayer.clearLayers();
    const visible = observations.filter(matchesFilters);
    visible.forEach((observation) => {
      L.marker([observation.latitude, observation.longitude], {
        icon: markerIcon(observation.category, observation.dataType), keyboard: true,
        title: `${observation.type || "Observation"}: ${observation.title || "View observation"}`
      }).bindPopup(popupContent(observation), { className: "observation-popup", maxWidth: 320 }).addTo(markerLayer);
    });
    const total = observations.length;
    resultCount.textContent = visible.length === total ? `${total} ${total === 1 ? "OBSERVATION" : "OBSERVATIONS"}` : `${visible.length} OF ${total} OBSERVATIONS`;
    updateControls();
    if (!visible.length) {
      const categoryName = activeCategory === "all" ? "" : `${activeCategory[0].toUpperCase()}${activeCategory.slice(1)} `;
      showMessage(`No published ${categoryName}observations are currently available.`);
    } else clearMessage();
  }

  function bindFilters() {
    categoryButtons.forEach((button) => button.addEventListener("click", () => { activeCategory = button.dataset.categoryFilter; renderMarkers(); }));
    tradeButtons.forEach((button) => button.addEventListener("click", () => { const filter = button.dataset.tradeFilter; activeTradeFilter = activeTradeFilter === filter ? "" : filter; renderMarkers(); }));
    clearTradeButton.addEventListener("click", () => { activeTradeFilter = ""; renderMarkers(); });
  }

  fetch("data/public-responses.csv")
    .then((response) => { if (!response.ok) throw new Error(`CSV request failed with ${response.status}`); return response.text(); })
    .then((csv) => {
      const parsed = Papa.parse(csv, { header: true, skipEmptyLines: "greedy" });
      if (parsed.errors.length) console.warn("CSV parsing warnings:", parsed.errors);
      observations = parsed.data.map(createObservation).filter(Boolean);
      if (!observations.length) {
        console.error("No public geolocated observations were available in public-responses.csv.");
        resultCount.textContent = "0 OBSERVATIONS";
        showMessage("No published observations are currently available.");
        return;
      }
      renderMarkers();
      const bounds = L.latLngBounds(observations.map((observation) => [observation.latitude, observation.longitude]));
      map.fitBounds(bounds.pad(0.18), { maxZoom: 16 });
    })
    .catch((error) => {
      console.error("Response data could not be loaded:", error);
      resultCount.textContent = "0 OBSERVATIONS";
      showMessage("Response data could not be loaded.");
    });

  bindFilters();
});
