import * as Cesium from 'cesium';

const LAYER_ID = 'roads';
const ESRI_TRANSPORT_URL =
  'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer';

const state = {
  viewer: null,
  imageryLayer: null,
  enabled: false,
  lastUpdate: null,
  error: null,
  loading: false,
};

export const roadsLayer = {
  id: LAYER_ID,
  name: 'Road Maps',
  icon: '🛣️',
  source: 'Esri Transportation',
  updateInterval: 86400000,
  showInTogglePanel: true,

  get enabled() {
    return state.enabled;
  },

  get stats() {
    return {
      count: state.enabled ? 'Global' : 0,
      lastUpdate: state.lastUpdate,
      error: state.error,
      loading: state.loading,
    };
  },

  init(viewer) {
    state.viewer = viewer;
    console.log('[Data:Roads] Initialized');
  },

  async enable(viewer) {
    state.enabled = true;
    state.loading = true;
    try {
      if (!state.imageryLayer) {
        const provider = await Cesium.ArcGisMapServerImageryProvider.fromUrl(ESRI_TRANSPORT_URL, {
          enablePickFeatures: false,
        });
        if (state.viewer) {
          state.imageryLayer = state.viewer.imageryLayers.addImageryProvider(provider);
        }
      }
      if (state.imageryLayer) {
        state.imageryLayer.show = true;
      }
      state.lastUpdate = new Date();
    } catch (err) {
      state.error = err?.message || 'Failed to load road overlay';
      console.warn('[Data:Roads] Load failed:', err);
    } finally {
      state.loading = false;
    }
  },

  disable(viewer) {
    state.enabled = false;
    if (state.imageryLayer) {
      state.imageryLayer.show = false;
    }
  },

  async update(viewer) {
    // Continuous worldwide tile service
  },

  destroy(viewer) {
    if (state.imageryLayer && viewer?.imageryLayers) {
      viewer.imageryLayers.remove(state.imageryLayer, true);
      state.imageryLayer = null;
    }
    state.viewer = null;
    state.enabled = false;
  },
};

export default roadsLayer;
