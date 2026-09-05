/**
 * gevBridge.js — GEV Interface Fetcher & Core Bridge
 *
 * Provides a clean, decoupled API facade over the Cesium viewer, DataLayerManager,
 * StyleManager, camera systems, tracking telemetry, and CCTV feeds.
 *
 * This allows any UI (modern drawer UI, external dashboards, custom pages) to
 * interact with God's Eye View capabilities without coupling to engine internals
 * or creating merge conflicts with upstream updates.
 *
 * @module gevBridge
 */

import * as Cesium from 'cesium';
import {
  CITY_POIS,
  GLOBE_VIEW,
  flyToGlobeView,
  flyToLandmark,
  flyToPresetLocation,
  searchAndFlyTo,
  fallbackKeylessGeocode,
} from '../locations.js';
import { GLOBAL_POIS } from '../data/poi.js';
import cctvLayer from '../data/cctv.js';
import { enterCockpitWithTracking } from '../cockpitTracking.js';

/** Layer categorization metadata for clean organization */
export const LAYER_CATEGORIES = Object.freeze({
  aviation: {
    id: 'aviation',
    label: 'Aviation',
    icon: 'flight',
    layerIds: ['flights', 'military'],
  },
  maritime_transit: {
    id: 'maritime_transit',
    label: 'Maritime & Transit',
    icon: 'directions_boat',
    layerIds: ['ais-live-vessels', 'traffic', 'bikeshare'],
  },
  infrastructure: {
    id: 'infrastructure',
    label: 'Infrastructure & Ground',
    icon: 'cell_tower',
    layerIds: ['cctv', 'telegeography-submarine-cables', 'local-datacenters', 'local-dams', 'military-installations', 'military-awareness', 'radio'],
  },
  space: {
    id: 'space',
    label: 'Space & Orbit',
    icon: 'rocket_launch',
    layerIds: ['satellites', 'rocket-launches'],
  },
  environment: {
    id: 'environment',
    label: 'Earth & Environment',
    icon: 'volcano',
    layerIds: ['earthquakes', 'local-firms', 'volcanoes'],
  },
  cartography: {
    id: 'cartography',
    label: 'Cartography & Reference',
    icon: 'map',
    layerIds: ['borders', 'roads', 'poi'],
  },
});

export const STYLE_PRESETS = Object.freeze([
  { id: 'normal', label: 'Normal', icon: '◯', description: 'Clean photorealistic 3D globe' },
  { id: 'retro', label: 'CRT', icon: '▦', description: 'Phosphor cathode-ray tube raster' },
  { id: 'surveillance', label: 'NVG', icon: '🌙', description: 'Night-vision surveillance green' },
  { id: 'thermal', label: 'FLIR', icon: '🌡️', description: 'Infrared thermal heat signature' },
  { id: 'anime', label: 'Anime', icon: '✦', description: 'Vibrant stylized cel-shading' },
  { id: 'noir', label: 'Noir', icon: '◐', description: 'High-contrast monochrome detective lens' },
  { id: 'snow', label: 'Snow', icon: '❄', description: 'Winter blizzard atmospheric overlay' },
]);

class GevBridge {
  constructor() {
    this.viewer = null;
    this.dataManager = null;
    this.styleManager = null;
    this._initialized = false;

    this._layerListeners = new Set();
    this._trackedListeners = new Set();
    this._cctvListeners = new Set();
    this._styleListeners = new Set();

    this._trackedPollTimer = null;
    this._currentTrackedItem = null;
    this._cctvSyncTimer = null;
  }

  /**
   * Initializes the bridge with core subsystem references.
   *
   * @param {Object} context
   * @param {Cesium.Viewer} context.viewer
   * @param {Object} context.dataManager
   * @param {Object} context.styleManager
   */
  init({ viewer, dataManager, styleManager } = {}) {
    this.viewer = viewer;
    this.dataManager = dataManager;
    this.styleManager = styleManager;
    this._initialized = true;

    // Listen to data manager changes
    if (this.dataManager) {
      this.dataManager.subscribe((event) => {
        this._notifyLayerListeners(event);
      });
    }

    // Bind entity selection & tracking listeners
    this._bindTrackingTelemetry();

    // Bind CCTV sync listeners
    this._bindCctvWatcher();

    console.info('[GevBridge] Interface fetcher / Core bridge initialized successfully');
  }

  get isReady() {
    return this._initialized && Boolean(this.viewer && this.dataManager);
  }

  // =========================================================================
  // 1. DATA LAYERS API
  // =========================================================================

  /**
   * Returns list of all registered layers with normalized metadata and counts.
   * @returns {Array<Object>}
   */
  getLayers() {
    if (!this.dataManager) return [];
    const all = this.dataManager.getAll();

    return all.map((l) => {
      // Resolve category
      let category = 'infrastructure';
      for (const [catKey, cat] of Object.entries(LAYER_CATEGORIES)) {
        if (cat.layerIds.includes(l.id)) {
          category = catKey;
          break;
        }
      }

      const count = l.stats?.count ?? 0;
      const status = l.feedState || l.stats?.status || (l.enabled ? 'nominal' : 'disabled');
      const loading = l.stats?.loading ?? false;

      return {
        id: l.id,
        name: l.name || l.id,
        icon: l.icon || '●',
        category,
        description: l.description || '',
        enabled: Boolean(l.enabled),
        count,
        status,
        loading,
        color: l.color || '#6be8ff',
      };
    });
  }

  /**
   * Returns layers organized by category.
   * @returns {Object} { [categoryKey]: { ...categoryMeta, layers: [...] } }
   */
  getCategorizedLayers() {
    const layers = this.getLayers();
    const result = {};

    for (const [key, meta] of Object.entries(LAYER_CATEGORIES)) {
      result[key] = {
        ...meta,
        layers: layers.filter((l) => l.category === key),
      };
    }

    return result;
  }

  /**
   * Gets single layer details and current stats.
   * @param {string} layerId
   * @returns {Object|null}
   */
  getLayer(layerId) {
    if (!this.dataManager) return null;
    return this.getLayers().find((l) => l.id === layerId) || null;
  }

  /**
   * Check if layer is enabled.
   * @param {string} layerId
   * @returns {boolean}
   */
  isLayerEnabled(layerId) {
    return Boolean(this.dataManager?.isEnabled(layerId));
  }

  /**
   * Toggles or sets a layer's enabled state.
   * @param {string} layerId
   * @param {boolean} [explicitState]
   * @returns {Promise<boolean>}
   */
  async toggleLayer(layerId, explicitState = undefined) {
    if (!this.dataManager) return false;
    const currentState = this.isLayerEnabled(layerId);
    const nextState = explicitState !== undefined ? Boolean(explicitState) : !currentState;
    try {
      await this.dataManager.setEnabled(layerId, nextState, { origin: 'user' });
      return nextState;
    } catch (err) {
      console.warn(`[GevBridge] Failed to set layer ${layerId}:`, err);
      return currentState;
    }
  }

  /**
   * Disables all active layers.
   * @returns {Promise<void>}
   */
  async clearAllLayers() {
    if (!this.dataManager) return;
    const active = this.dataManager.getAll().filter((l) => l.enabled);
    for (const layer of active) {
      try {
        await this.dataManager.setEnabled(layer.id, false, { origin: 'user' });
      } catch {
        // Continue clearing
      }
    }
  }

  /**
   * Subscribes to layer changes.
   * @param {Function} callback
   * @returns {Function} Unsubscribe function
   */
  subscribeLayers(callback) {
    if (typeof callback !== 'function') return () => {};
    this._layerListeners.add(callback);
    return () => this._layerListeners.delete(callback);
  }

  _notifyLayerListeners(event) {
    for (const listener of this._layerListeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('[GevBridge] Layer listener error:', err);
      }
    }
  }

  // =========================================================================
  // 2. VIEWS & CAMERA NAVIGATION API
  // =========================================================================

  /**
   * Returns available view presets grouped by category.
   * @returns {Object}
   */
  getViews() {
    const metros = Object.entries(CITY_POIS).map(([id, city]) => ({
      id,
      name: city.name,
      category: 'metro',
      detail: `${city.pois?.length || 5} Landmarks`,
      icon: 'location_city',
      elevation: city.groundElevation || 0,
    }));

    const landmarks = GLOBAL_POIS.map((poi) => ({
      id: `poi:${poi.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
      name: poi.name,
      category: 'landmark',
      subCategory: poi.category || 'Curated',
      country: poi.country || '',
      lat: poi.lat,
      lon: poi.lon,
      range: poi.alt || 800,
      pitch: poi.pitch || -25,
      heading: poi.heading || 0,
      icon: poi.category === 'Wonder' ? 'stars' : poi.category === 'Natural' ? 'terrain' : 'tour',
    }));

    return {
      planetary: [
        { id: 'globe', name: 'Full Globe', detail: '18,000 km Orbital Nadir', icon: 'public' },
        { id: 'orbit', name: 'Orbital Drift', detail: 'Cinematic 360° Rotation', icon: 'sync' },
      ],
      metros,
      landmarks,
    };
  }

  /**
   * Flies camera to a specific preset view, city, or landmark.
   * @param {string|Object} target - View ID ('globe', 'austin', etc.) or coordinates
   * @returns {Promise<void>}
   */
  async flyToView(target) {
    if (!this.viewer) return;

    if (target === 'globe') {
      flyToGlobeView(this.viewer);
      return;
    }

    if (target === 'orbit') {
      this.styleManager?._toggleOrbit?.();
      return;
    }

    // Check if target is city ID
    if (typeof target === 'string' && CITY_POIS[target]) {
      if (typeof this.styleManager?._onCityPillClick === 'function') {
        this.styleManager._onCityPillClick(target);
      } else {
        flyToPresetLocation(this.viewer, target);
      }
      return;
    }

    // Check if target is a landmark POI object or id
    if (typeof target === 'object' && target.lat && target.lon) {
      flyToLandmark(this.viewer, target.lat, target.lon, {
        range: target.range || target.alt || 800,
        pitch: target.pitch || -25,
        heading: target.heading || 0,
      });
      return;
    }

    if (typeof target === 'string' && target.startsWith('poi:')) {
      const poiName = target.slice(4).replace(/-/g, ' ');
      const matched = GLOBAL_POIS.find((p) => p.name.toLowerCase() === poiName);
      if (matched) {
        flyToLandmark(this.viewer, matched.lat, matched.lon, {
          range: matched.alt || 800,
          pitch: matched.pitch || -25,
          heading: matched.heading || 0,
        });
      }
    }
  }

  /**
   * Executes location search query with keyless fallback support.
   * @param {string} query
   * @returns {Promise<Object|null>}
   */
  async searchLocation(query) {
    if (!this.viewer || !query?.trim()) return null;
    return searchAndFlyTo(this.viewer, query.trim());
  }

  /**
   * Returns autocompletion suggestions for a search query.
   * @param {string} query
   * @returns {Promise<Array<Object>>}
   */
  async getSearchSuggestions(query) {
    const q = String(query || '').trim().toLowerCase();
    if (q.length < 2) return [];

    const suggestions = [];

    // 1. Cities
    for (const [cityId, city] of Object.entries(CITY_POIS)) {
      if (city.name.toLowerCase().includes(q)) {
        suggestions.push({
          type: 'city',
          id: cityId,
          name: city.name,
          detail: 'Metro Region Overview',
          icon: 'location_city',
          badge: 'CITY',
        });
      }
    }

    // 2. Global POIs
    for (const poi of GLOBAL_POIS) {
      if (poi.name.toLowerCase().includes(q) || poi.country?.toLowerCase().includes(q)) {
        suggestions.push({
          type: 'poi',
          id: `poi:${poi.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
          name: poi.name,
          detail: `${poi.country || ''} · ${poi.category || ''}`.trim(),
          poi,
          icon: poi.category === 'Wonder' ? 'stars' : poi.category === 'Natural' ? 'terrain' : 'tour',
          badge: (poi.category || 'POI').toUpperCase(),
        });
      }
    }

    // 3. Fallback Keyless Geocoder query
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(query.trim())}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.results)) {
          for (const item of data.results) {
            const formatted = item.formatted_address || '';
            const typeLabel = (item.types?.[0] || 'place').toUpperCase();
            if (!suggestions.some((s) => s.name.toLowerCase() === formatted.toLowerCase())) {
              suggestions.push({
                type: 'geocode',
                id: `geo:${item.lat},${item.lng}`,
                name: formatted.split(',')[0] || formatted,
                detail: formatted,
                lat: item.lat,
                lon: item.lng,
                icon: 'place',
                badge: typeLabel.slice(0, 8),
              });
            }
          }
        }
      }
    } catch {
      // Fallback silently if offline
    }

    return suggestions.slice(0, 8);
  }

  // =========================================================================
  // 3. ITEM INSPECTION & TRACKING TELEMETRY API
  // =========================================================================

  _bindTrackingTelemetry() {
    if (!this.viewer) return;

    const updateFromEntity = (entity) => {
      if (!entity) {
        this._currentTrackedItem = null;
        this._notifyTrackedListeners(null);
        return;
      }

      this._extractEntityTelemetry(entity);
    };

    this.viewer.trackedEntityChanged.addEventListener((entity) => {
      updateFromEntity(entity);
    });

    if (this.viewer.selectedEntityChanged) {
      this.viewer.selectedEntityChanged.addEventListener((entity) => {
        if (!this.viewer.trackedEntity) {
          updateFromEntity(entity);
        }
      });
    }

    // Listen for custom selection events
    window.addEventListener('gev:entity-selected', (e) => {
      if (e.detail?.entity) updateFromEntity(e.detail.entity);
    });

    window.addEventListener('gev:awareness-subject-selected', (e) => {
      if (e.detail) {
        this._currentTrackedItem = {
          id: e.detail.id || 'target',
          title: e.detail.callsign || e.detail.title || 'CONTACT',
          category: e.detail.category || 'AIRCRAFT',
          lat: e.detail.lat,
          lon: e.detail.lon,
          altFt: e.detail.altitudeFt ?? Math.round((e.detail.altitude || 0) * 3.28084),
          speedKts: e.detail.speedKts ?? Math.round((e.detail.velocity || 0) * 1.94384),
          headingDeg: e.detail.headingDeg ?? e.detail.heading,
          distanceKm: e.detail.distanceKm,
          bearingDeg: e.detail.bearingDeg,
          operator: e.detail.operator || e.detail.owner || '',
          metadata: e.detail,
        };
        this._notifyTrackedListeners(this._currentTrackedItem);
      }
    });

    window.addEventListener('gev:entity-selection-cleared', () => {
      if (!this.viewer.trackedEntity) {
        this._currentTrackedItem = null;
        this._notifyTrackedListeners(null);
      }
    });

    // 2-second interval poll for live telemetry updates on moving tracked target
    this._trackedPollTimer = setInterval(() => {
      const active = this.viewer.trackedEntity;
      if (active) {
        this._extractEntityTelemetry(active);
      }
    }, 1500);
  }

  _extractEntityTelemetry(entity) {
    if (!entity) return;

    let lat = null;
    let lon = null;
    let altM = null;

    try {
      let cartesian = null;
      if (typeof entity.gevVisualPosition === 'function') {
        cartesian = entity.gevVisualPosition();
      } else if (typeof entity.gevDisplayPosition === 'function') {
        cartesian = entity.gevDisplayPosition();
      } else if (entity.position?.getValue) {
        cartesian = entity.position.getValue(this.viewer.clock.currentTime);
      }

      if (cartesian) {
        const carto = Cesium.Cartographic.fromCartesian(cartesian);
        if (carto) {
          lat = Cesium.Math.toDegrees(carto.latitude);
          lon = Cesium.Math.toDegrees(carto.longitude);
          altM = carto.height;
        }
      }
    } catch {
      // Best effort
    }

    const title = entity.name || entity.id || 'TARGET';
    const altFt = altM !== null ? Math.round(altM * 3.28084) : null;

    // Calculate distance from viewer camera
    let distanceKm = null;
    let bearingDeg = null;
    try {
      if (lat !== null && lon !== null && this.viewer.camera) {
        const camCarto = this.viewer.camera.positionCartographic;
        if (camCarto) {
          const camLat = Cesium.Math.toDegrees(camCarto.latitude);
          const camLon = Cesium.Math.toDegrees(camCarto.longitude);
          const dLat = (lat - camLat) * (Math.PI / 180);
          const dLon = (lon - camLon) * (Math.PI / 180);
          const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(camLat * (Math.PI / 180)) * Math.cos(lat * (Math.PI / 180)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          distanceKm = Math.round(6371 * c);

          const y = Math.sin(dLon) * Math.cos(lat * (Math.PI / 180));
          const x = Math.cos(camLat * (Math.PI / 180)) * Math.sin(lat * (Math.PI / 180)) -
            Math.sin(camLat * (Math.PI / 180)) * Math.cos(lat * (Math.PI / 180)) * Math.cos(dLon);
          bearingDeg = Math.round(((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360);
        }
      }
    } catch {
      // Best effort
    }

    this._currentTrackedItem = {
      id: String(entity.id || ''),
      title: String(title),
      category: entity.gevCategory || entity.description || 'TARGET',
      lat: lat !== null ? Number(lat.toFixed(4)) : null,
      lon: lon !== null ? Number(lon.toFixed(4)) : null,
      altFt,
      speedKts: entity.gevSpeedKts || null,
      headingDeg: entity.gevHeadingDeg || null,
      distanceKm,
      bearingDeg,
      operator: entity.gevOperator || entity.gevOwner || '',
      canCockpit: Boolean(entity.gevIsAircraft || entity.id?.startsWith?.('flight-') || entity.id?.startsWith?.('mil-')),
      rawEntity: entity,
    };

    this._notifyTrackedListeners(this._currentTrackedItem);
  }

  /**
   * Returns current tracked target item telemetry, or null if none.
   * @returns {Object|null}
   */
  getActiveTracked() {
    return this._currentTrackedItem;
  }

  /**
   * Releases currently tracked target and follow camera.
   */
  untrack() {
    if (this.viewer) {
      this.viewer.trackedEntity = undefined;
      this.viewer.selectedEntity = undefined;
    }
    this._currentTrackedItem = null;
    this._notifyTrackedListeners(null);
  }

  /**
   * Switches into first-person cockpit view for the tracked aircraft.
   */
  enterCockpit() {
    const active = this.viewer?.trackedEntity;
    if (active && typeof enterCockpitWithTracking === 'function') {
      enterCockpitWithTracking(this.viewer, active);
    }
  }

  /**
   * Subscribes to tracked target changes and live telemetry updates.
   * @param {Function} callback
   * @returns {Function} Unsubscribe function
   */
  subscribeTrackedItem(callback) {
    if (typeof callback !== 'function') return () => {};
    this._trackedListeners.add(callback);
    callback(this._currentTrackedItem);
    return () => this._trackedListeners.delete(callback);
  }

  _notifyTrackedListeners(item) {
    for (const listener of this._trackedListeners) {
      try {
        listener(item);
      } catch (err) {
        console.error('[GevBridge] Tracked listener error:', err);
      }
    }
  }

  // =========================================================================
  // 4. CCTV SURVEILLANCE & FULLSCREEN API
  // =========================================================================

  _bindCctvWatcher() {
    this._cctvSyncTimer = setInterval(() => {
      if (this.isLayerEnabled('cctv')) {
        this._notifyCctvListeners(this.getCctvState());
      }
    }, 2500);
  }

  /**
   * Returns current CCTV layer state and active camera metadata.
   * @returns {Object}
   */
  getCctvState() {
    const isEnabled = this.isLayerEnabled('cctv');
    const stats = cctvLayer?.getStats?.() || {};
    const activeCamera = cctvLayer?.getActiveCamera?.() || null;
    const cameraSelect = document.getElementById('cctv-camera-select');
    const cameras = cameraSelect
      ? Array.from(cameraSelect.options).map((opt) => ({ id: opt.value, name: opt.text }))
      : [];

    const frameEl = document.getElementById('cctv-frame');
    const frameSrc = frameEl?.getAttribute('src') || '';
    const badgeEl = document.getElementById('cctv-source-badge');
    const badgeText = badgeEl?.textContent || 'SOURCE · READY';

    return {
      enabled: isEnabled,
      activeCameraId: activeCamera?.id || cameraSelect?.value || '',
      activeCameraName: activeCamera?.name || cameraSelect?.selectedOptions?.[0]?.text || 'CAMERA',
      cameras,
      frameSrc,
      sourceStatus: badgeText,
      count: stats.count || cameras.length,
      autoHop: Boolean(stats.autoHop),
      headingDeg: activeCamera?.headingDeg ?? 0,
      pitchDeg: activeCamera?.pitchDeg ?? 0,
      fovDeg: activeCamera?.fovDeg ?? 60,
    };
  }

  /**
   * Selects CCTV camera by ID and flies camera to it.
   * @param {string} cameraId
   */
  selectCctvCamera(cameraId) {
    if (!cameraId || !cctvLayer) return;
    cctvLayer.selectCamera(cameraId);
    cctvLayer.focusCamera(cameraId, 1.8);
    this._notifyCctvListeners(this.getCctvState());
  }

  /**
   * Cycles CCTV camera by step (+1 or -1).
   * @param {number} delta
   */
  cycleCctvCamera(delta = 1) {
    if (!cctvLayer) return;
    const id = cctvLayer.cycleCamera(delta);
    if (id) {
      cctvLayer.focusCamera(id, 1.4);
      this._notifyCctvListeners(this.getCctvState());
    }
  }

  /**
   * Subscribes to CCTV state updates.
   * @param {Function} callback
   * @returns {Function} Unsubscribe function
   */
  subscribeCctv(callback) {
    if (typeof callback !== 'function') return () => {};
    this._cctvListeners.add(callback);
    callback(this.getCctvState());
    return () => this._cctvListeners.delete(callback);
  }

  _notifyCctvListeners(state) {
    for (const listener of this._cctvListeners) {
      try {
        listener(state);
      } catch (err) {
        console.error('[GevBridge] CCTV listener error:', err);
      }
    }
  }

  // =========================================================================
  // 5. VISUAL STYLES & POST-PROCESSING API
  // =========================================================================

  getStyles() {
    return STYLE_PRESETS;
  }

  getActiveStyle() {
    return this.styleManager?.activeStyle || 'normal';
  }

  setStyle(styleId) {
    if (typeof this.styleManager?.setStyle === 'function') {
      this.styleManager.setStyle(styleId, { applyPreset: true });
      for (const listener of this._styleListeners) {
        try { listener(styleId); } catch {}
      }
    }
  }

  subscribeStyles(callback) {
    if (typeof callback !== 'function') return () => {};
    this._styleListeners.add(callback);
    callback(this.getActiveStyle());
    return () => this._styleListeners.delete(callback);
  }
}

export const gevBridge = new GevBridge();
export default gevBridge;
