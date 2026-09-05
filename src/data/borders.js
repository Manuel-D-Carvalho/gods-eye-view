import * as Cesium from 'cesium';
import { registerPickOwner, unregisterPickOwner } from './pickRegistry.js';
import {
  registerEntityContext,
  clearSelectedEntityContextForLayer,
  selectEntityContext,
  removeEntityContextsForLayer,
} from './contextStore.js';
import countriesGeojson from './local_data/natural_earth/countries.json' with { type: 'json' };

const LAYER_ID = 'borders';
const ESRI_BOUNDARIES_URL =
  'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer';

const state = {
  viewer: null,
  dataSource: null,
  imageryLayer: null,
  enabled: false,
  records: [],
  selectedId: null,
  lastUpdate: null,
  error: null,
  loading: false,
  clickHandler: null,
};

function handlePick(click) {
  if (!state.enabled || !state.viewer) return;
  const scene = state.viewer.scene;
  const picked = scene.pick(click.position, 15, 15) || scene.pick(click.position);

  if (picked?.id && state.dataSource && picked.id.entityCollection?.owner === state.dataSource) {
    const id = picked.id.id;
    state.selectedId = id;
    selectEntityContext(LAYER_ID, id);
  }
}

export const bordersLayer = {
  id: LAYER_ID,
  name: 'Country Borders',
  icon: '🌐',
  source: 'Natural Earth & Esri',
  updateInterval: 86400000,
  showInTogglePanel: true,

  get enabled() {
    return state.enabled;
  },

  get stats() {
    return {
      count: state.records.length || 177,
      lastUpdate: state.lastUpdate,
      error: state.error,
      loading: state.loading,
    };
  },

  init(viewer) {
    state.viewer = viewer;

    registerPickOwner(LAYER_ID, (picked) => (
      picked?.id && state.dataSource && picked.id.entityCollection?.owner === state.dataSource
    ));

    state.clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    state.clickHandler.setInputAction(handlePick, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    console.log('[Data:Borders] Initialized');
  },

  async enable(viewer) {
    state.enabled = true;

    // 1. Vector Country Polygons & Outlines
    if (!state.dataSource) {
      state.loading = true;
      try {
        state.dataSource = await Cesium.GeoJsonDataSource.load(countriesGeojson, {
          stroke: Cesium.Color.fromCssColorString('#00d4ff').withAlpha(0.85),
          fill: Cesium.Color.fromCssColorString('#00d4ff').withAlpha(0.04),
          strokeWidth: 2,
          clampToGround: true,
        });

        // Register entity contexts
        const entities = state.dataSource.entities.values;
        state.records = entities;

        for (const entity of entities) {
          const props = entity.properties;
          const name = props?.name?.getValue?.() || entity.name || 'Country';
          const iso = props?.iso_a2?.getValue?.() || props?.adm0_a3?.getValue?.() || name;

          registerEntityContext({
            layerId: LAYER_ID,
            entityId: entity.id,
            title: name,
            subtitle: `${props?.continent?.getValue?.() || 'World'} · ${props?.subregion?.getValue?.() || ''}`.trim(),
            accent: '#00d4ff',
            sections: [
              {
                title: 'National Demographics',
                rows: [
                  { label: 'Official Name', value: props?.formal_en?.getValue?.() || name },
                  { label: 'Continent', value: props?.continent?.getValue?.() || '—' },
                  { label: 'Region', value: props?.subregion?.getValue?.() || '—' },
                  {
                    label: 'Est. Population',
                    value: props?.pop_est?.getValue?.()
                      ? Number(props.pop_est.getValue()).toLocaleString()
                      : '—',
                  },
                  { label: 'Economy', value: props?.economy?.getValue?.() || '—' },
                ],
              },
            ],
          });
        }

        state.viewer?.dataSources?.add(state.dataSource);
        state.lastUpdate = new Date();
      } catch (err) {
        state.error = err?.message || 'Failed to load country borders';
        console.warn('[Data:Borders] GeoJSON load failed:', err);
      } finally {
        state.loading = false;
      }
    } else {
      state.dataSource.show = true;
    }

    // 2. High-res Esri Boundaries & Places Reference Overlay (labels + state/province lines)
    if (!state.imageryLayer) {
      try {
        const provider = await Cesium.ArcGisMapServerImageryProvider.fromUrl(ESRI_BOUNDARIES_URL, {
          enablePickFeatures: false,
        });
        if (state.viewer) {
          state.imageryLayer = state.viewer.imageryLayers.addImageryProvider(provider);
        }
      } catch (err) {
        console.warn('[Data:Borders] Esri boundaries overlay load failed:', err);
      }
    } else {
      state.imageryLayer.show = true;
    }
  },

  disable(viewer) {
    state.enabled = false;
    if (state.dataSource) state.dataSource.show = false;
    if (state.imageryLayer) state.imageryLayer.show = false;
    clearSelectedEntityContextForLayer(LAYER_ID);
  },

  async update(viewer) {
    // Static geographic dataset
  },

  destroy(viewer) {
    if (state.clickHandler) {
      state.clickHandler.destroy();
      state.clickHandler = null;
    }
    unregisterPickOwner(LAYER_ID);
    removeEntityContextsForLayer(LAYER_ID);

    if (state.dataSource && viewer?.dataSources) {
      viewer.dataSources.remove(state.dataSource, true);
    }
    state.dataSource = null;

    if (state.imageryLayer && viewer?.imageryLayers) {
      viewer.imageryLayers.remove(state.imageryLayer, true);
      state.imageryLayer = null;
    }

    state.viewer = null;
    state.enabled = false;
  },
};

export default bordersLayer;
