import * as Cesium from 'cesium';
import { registerPickOwner, unregisterPickOwner } from './pickRegistry.js';
import {
  registerEntityContext,
  clearSelectedEntityContextForLayer,
  selectEntityContext,
  removeEntityContextsForLayer,
} from './contextStore.js';

const LAYER_ID = 'volcanoes';
const PICK_TOLERANCE_PX = 20;

/** SVG icons for active vs dormant volcanoes */
function createVolcanoSvgUri(color, strokeColor = '#ffffff') {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <defs>
      <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="2" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>
    <polygon points="16,4 28,28 4,28" fill="${color}" stroke="${strokeColor}" stroke-width="2" filter="url(#glow)" />
    <circle cx="16" cy="11" r="3" fill="#ffee55" />
    <line x1="16" y1="2" x2="16" y2="7" stroke="#ffee55" stroke-width="2" stroke-linecap="round" />
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const ACTIVE_ICON_URI = createVolcanoSvgUri('#ff3700', '#ffffff');
const DORMANT_ICON_URI = createVolcanoSvgUri('#e69500', '#ffeeaa');

const state = {
  viewer: null,
  dataSource: null,
  enabled: false,
  records: [],
  recordById: new Map(),
  selectedId: null,
  lastUpdate: null,
  error: null,
  loading: false,
  clickHandler: null,
};

function formatEruption(year) {
  if (year === null || year === undefined) return 'Unknown / Prehistoric';
  if (year < 0) return `${Math.abs(year)} BCE`;
  return `${year} CE`;
}

function handlePick(click) {
  if (!state.enabled || !state.viewer) return;
  const scene = state.viewer.scene;

  const picked = scene.pick(click.position, PICK_TOLERANCE_PX, PICK_TOLERANCE_PX)
    || scene.pick(click.position);

  if (picked?.id && typeof picked.id.id === 'string' && picked.id.id.startsWith('volcano:')) {
    const volcanoId = picked.id.id.replace('volcano:', '');
    const volcano = state.recordById.get(volcanoId);
    if (volcano) {
      state.selectedId = volcanoId;
      selectEntityContext(LAYER_ID, volcanoId);

      // Smooth camera nudge toward volcano
      if (Number.isFinite(volcano.lat) && Number.isFinite(volcano.lon)) {
        state.viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(
            volcano.lon,
            volcano.lat,
            Math.max(volcano.elevation + 8000, 15000)
          ),
          duration: 1.5,
        });
      }
    }
  }
}

async function fetchVolcanoes() {
  state.loading = true;
  state.error = null;
  try {
    const res = await fetch('/api/volcanoes');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const volcanoes = Array.isArray(data?.volcanoes) ? data.volcanoes : [];

    state.records = volcanoes;
    state.recordById.clear();
    state.lastUpdate = new Date();

    if (state.dataSource) {
      state.dataSource.entities.removeAll();
      removeEntityContextsForLayer(LAYER_ID);

      const currentYear = new Date().getFullYear();

      for (const v of volcanoes) {
        const idStr = String(v.id);
        state.recordById.set(idStr, v);

        if (!Number.isFinite(v.lat) || !Number.isFinite(v.lon)) continue;

        const isRecent = v.lastEruption !== null && v.lastEruption >= (currentYear - 80);
        const iconUri = isRecent ? ACTIVE_ICON_URI : DORMANT_ICON_URI;

        const pos = Cesium.Cartesian3.fromDegrees(v.lon, v.lat, 0);

        state.dataSource.entities.add({
          id: `volcano:${idStr}`,
          name: v.name,
          position: pos,
          billboard: {
            image: iconUri,
            width: isRecent ? 28 : 22,
            height: isRecent ? 28 : 22,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 12000000),
          },
          label: {
            text: v.name,
            font: '11px "JetBrains Mono", monospace',
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 3,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.TOP,
            pixelOffset: new Cesium.Cartesian2(0, 4),
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 400000),
          },
          properties: {
            raw: v,
            elevation: v.elevation,
            type: v.type,
            country: v.country,
            lastEruption: v.lastEruption,
          },
        });

        registerEntityContext({
          layerId: LAYER_ID,
          entityId: idStr,
          title: v.name,
          subtitle: `${v.type} · ${v.country || v.region}`,
          accent: isRecent ? '#ff3700' : '#e69500',
          sections: [
            {
              title: 'Volcanic Profile',
              rows: [
                { label: 'Type', value: v.type },
                { label: 'Elevation', value: `${v.elevation.toLocaleString()} m (${Math.round(v.elevation * 3.28084).toLocaleString()} ft)` },
                { label: 'Country', value: v.country || 'International' },
                { label: 'Region', value: v.region || '—' },
                { label: 'Last Eruption', value: formatEruption(v.lastEruption) },
              ],
            },
            ...(v.summary ? [{
              title: 'Geological Overview',
              rows: [{ label: 'Summary', value: v.summary }],
            }] : []),
          ],
        });
      }
    }
  } catch (err) {
    state.error = err?.message || 'Failed to fetch volcanoes';
    console.warn('[Data:Volcanoes] Fetch failed:', err);
  } finally {
    state.loading = false;
  }
}

export const volcanoesLayer = {
  id: LAYER_ID,
  name: 'Volcanoes',
  icon: '🌋',
  source: 'Smithsonian GVP',
  updateInterval: 3600000,
  showInTogglePanel: true,

  get enabled() {
    return state.enabled;
  },

  get stats() {
    return {
      count: state.records.length,
      lastUpdate: state.lastUpdate,
      error: state.error,
      loading: state.loading,
    };
  },

  init(viewer) {
    state.viewer = viewer;
    state.dataSource = new Cesium.CustomDataSource(LAYER_ID);
    state.dataSource.show = false;
    viewer.dataSources.add(state.dataSource);

    registerPickOwner(LAYER_ID, (picked) => (
      picked?.id && typeof picked.id.id === 'string' && picked.id.id.startsWith('volcano:')
    ));

    state.clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    state.clickHandler.setInputAction(handlePick, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    console.log('[Data:Volcanoes] Initialized');
  },

  async enable(viewer) {
    state.enabled = true;
    if (state.dataSource) state.dataSource.show = true;
    if (state.records.length === 0) {
      await fetchVolcanoes();
    }
  },

  disable(viewer) {
    state.enabled = false;
    if (state.dataSource) state.dataSource.show = false;
    clearSelectedEntityContextForLayer(LAYER_ID);
  },

  async update(viewer) {
    if (!state.enabled) return;
    await fetchVolcanoes();
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
    state.viewer = null;
  },
};

export default volcanoesLayer;
