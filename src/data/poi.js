import * as Cesium from 'cesium';
import { CITY_POIS, flyToLandmark } from '../locations.js';
import { registerPickOwner, unregisterPickOwner } from './pickRegistry.js';
import {
  registerEntityContext,
  clearSelectedEntityContextForLayer,
  selectEntityContext,
  removeEntityContextsForLayer,
} from './contextStore.js';

const LAYER_ID = 'poi';
const PICK_TOLERANCE_PX = 20;

/** SVG beacon pin for POIs */
function createPoiSvgUri(color = '#00d4ff', symbol = '✦') {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="42" viewBox="0 0 36 42">
    <defs>
      <filter id="p-glow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="2.5" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>
    <path d="M18 2 C9.7 2 3 8.7 3 17 C3 28 18 40 18 40 C18 40 33 28 33 17 C33 8.7 26.3 2 18 2 Z" fill="rgba(9, 22, 34, 0.9)" stroke="${color}" stroke-width="2.5" filter="url(#p-glow)" />
    <circle cx="18" cy="17" r="9" fill="${color}" opacity="0.25" />
    <text x="18" y="21" font-family="'JetBrains Mono', monospace" font-size="12" font-weight="bold" fill="#ffffff" text-anchor="middle">${symbol}</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const WONDER_ICON = createPoiSvgUri('#ffaa00', '★');
const LANDMARK_ICON = createPoiSvgUri('#00d4ff', '◆');
const NATURAL_ICON = createPoiSvgUri('#00ffaa', '▲');

/** Curated Global Landmarks & World Wonders */
export const GLOBAL_POIS = [
  // ── World Wonders & Iconic Sites ─────────────────
  {
    id: 'pyramids-giza',
    name: 'Great Pyramid of Giza',
    category: 'Wonder',
    country: 'Egypt',
    lat: 29.9792,
    lon: 31.1342,
    alt: 650,
    pitch: -24,
    heading: 45,
    description: 'The oldest of the Seven Wonders of the Ancient World, built c. 2560 BCE as a tomb for Pharaoh Khufu.',
  },
  {
    id: 'eiffel-tower',
    name: 'Eiffel Tower',
    category: 'Landmark',
    country: 'France',
    lat: 48.8584,
    lon: 2.2945,
    alt: 600,
    pitch: -20,
    heading: 140,
    description: 'Iconic wrought-iron lattice tower on the Champ de Mars in Paris, designed by Gustave Eiffel for the 1889 World’s Fair.',
  },
  {
    id: 'taj-mahal',
    name: 'Taj Mahal',
    category: 'Wonder',
    country: 'India',
    lat: 27.1751,
    lon: 78.0421,
    alt: 550,
    pitch: -22,
    heading: 180,
    description: 'Ivory-white marble mausoleum on the Yamuna river, commissioned in 1631 by Mughal emperor Shah Jahan.',
  },
  {
    id: 'great-wall',
    name: 'Great Wall of China (Badaling)',
    category: 'Wonder',
    country: 'China',
    lat: 40.3584,
    lon: 116.0152,
    alt: 950,
    pitch: -25,
    heading: 320,
    description: 'Ancient series of fortifications stretching thousands of kilometers across historical northern borders of China.',
  },
  {
    id: 'colosseum',
    name: 'Colosseum',
    category: 'Wonder',
    country: 'Italy',
    lat: 41.8902,
    lon: 12.4922,
    alt: 450,
    pitch: -28,
    heading: 315,
    description: 'Largest ancient amphitheatre ever built, completed in 80 CE under the Flavian emperors of the Roman Empire.',
  },
  {
    id: 'machu-picchu',
    name: 'Machu Picchu',
    category: 'Wonder',
    country: 'Peru',
    lat: -13.1631,
    lon: -72.5450,
    alt: 850,
    pitch: -30,
    heading: 45,
    description: '15th-century Inca citadel set high in the Andes Mountains above the Urubamba River valley.',
  },
  {
    id: 'petra',
    name: 'Petra (Al-Khazneh)',
    category: 'Wonder',
    country: 'Jordan',
    lat: 30.3220,
    lon: 35.4516,
    alt: 450,
    pitch: -25,
    heading: 110,
    description: 'Famous rock-cut temple carved into the sandstone cliffs by the Nabataean Kingdom around the 1st century BCE.',
  },
  {
    id: 'christ-redeemer',
    name: 'Christ the Redeemer',
    category: 'Wonder',
    country: 'Brazil',
    lat: -22.9519,
    lon: -43.2105,
    alt: 400,
    pitch: -18,
    heading: 90,
    description: 'Art Deco statue of Jesus Christ overlooking Rio de Janeiro from the summit of Mount Corcovado.',
  },
  {
    id: 'burj-khalifa',
    name: 'Burj Khalifa',
    category: 'Landmark',
    country: 'United Arab Emirates',
    lat: 25.1972,
    lon: 55.2744,
    alt: 1200,
    pitch: -15,
    heading: 200,
    description: 'The world’s tallest skyscraper and structure, reaching 828 meters into the Dubai skyline.',
  },
  {
    id: 'sydney-opera',
    name: 'Sydney Opera House',
    category: 'Landmark',
    country: 'Australia',
    lat: -33.8568,
    lon: 151.2153,
    alt: 500,
    pitch: -22,
    heading: 200,
    description: 'Masterpiece of 20th-century expressionist architecture with interlocking vaulted sail shells on Sydney Harbour.',
  },
  {
    id: 'statue-liberty',
    name: 'Statue of Liberty',
    category: 'Landmark',
    country: 'United States',
    lat: 40.6892,
    lon: -74.0445,
    alt: 450,
    pitch: -25,
    heading: 315,
    description: 'Colossal neoclassical copper sculpture on Liberty Island in New York Harbor, dedicated in 1886.',
  },
  {
    id: 'mount-everest',
    name: 'Mount Everest',
    category: 'Natural',
    country: 'Nepal / China',
    lat: 27.9881,
    lon: 86.9250,
    alt: 4500,
    pitch: -20,
    heading: 180,
    description: 'Earth’s highest peak above sea level, reaching 8,848.86 meters in the Mahalangur Himal sub-range of the Himalayas.',
  },
  {
    id: 'mount-fuji-poi',
    name: 'Mount Fuji',
    category: 'Natural',
    country: 'Japan',
    lat: 35.3606,
    lon: 138.7274,
    alt: 3500,
    pitch: -22,
    heading: 135,
    description: 'Japan’s tallest mountain at 3,776 meters, celebrated for its exceptionally symmetrical active stratovolcano cone.',
  },
  {
    id: 'grand-canyon',
    name: 'Grand Canyon (South Rim)',
    category: 'Natural',
    country: 'United States',
    lat: 36.0544,
    lon: -112.1401,
    alt: 3000,
    pitch: -32,
    heading: 350,
    description: 'Steep-sided canyon carved by the Colorado River in Arizona, revealing billions of years of geological history.',
  },
  {
    id: 'angkor-wat',
    name: 'Angkor Wat',
    category: 'Wonder',
    country: 'Cambodia',
    lat: 13.4125,
    lon: 103.8670,
    alt: 750,
    pitch: -26,
    heading: 180,
    description: 'Largest religious monument in the world by area, built in the early 12th century as the state temple of the Khmer Empire.',
  },
  {
    id: 'acropolis',
    name: 'Acropolis of Athens (Parthenon)',
    category: 'Wonder',
    country: 'Greece',
    lat: 37.9715,
    lon: 23.7267,
    alt: 450,
    pitch: -25,
    heading: 230,
    description: 'Ancient citadel above Athens containing the remains of several ancient buildings of great architectural significance.',
  },
  {
    id: 'stonehenge',
    name: 'Stonehenge',
    category: 'Wonder',
    country: 'United Kingdom',
    lat: 51.1789,
    lon: -1.8262,
    alt: 350,
    pitch: -30,
    heading: 0,
    description: 'Prehistoric megalithic monument on Salisbury Plain in Wiltshire, constructed between 3000 BCE and 2000 BCE.',
  },
  {
    id: 'neuschwanstein',
    name: 'Neuschwanstein Castle',
    category: 'Landmark',
    country: 'Germany',
    lat: 47.5576,
    lon: 10.7498,
    alt: 650,
    pitch: -20,
    heading: 215,
    description: '19th-century historicist palace on a rugged hill above the village of Hohenschwangau in southwest Bavaria.',
  },
  {
    id: 'sagrada-familia',
    name: 'Basílica de la Sagrada Família',
    category: 'Landmark',
    country: 'Spain',
    lat: 41.4036,
    lon: 2.1744,
    alt: 550,
    pitch: -22,
    heading: 180,
    description: 'Unfinished Roman Catholic minor basilica in Barcelona, designed by Catalan architect Antoni Gaudí.',
  },
  {
    id: 'hagia-sophia',
    name: 'Hagia Sophia',
    category: 'Wonder',
    country: 'Turkey',
    lat: 41.0086,
    lon: 28.9802,
    alt: 450,
    pitch: -25,
    heading: 220,
    description: 'Late antique place of worship in Istanbul, renowned for its massive dome that altered the history of Byzantine architecture.',
  },
  {
    id: 'victoria-falls',
    name: 'Victoria Falls',
    category: 'Natural',
    country: 'Zambia / Zimbabwe',
    lat: -17.9243,
    lon: 25.8572,
    alt: 1200,
    pitch: -28,
    heading: 330,
    description: 'Spectacular waterfall on the Zambezi River forming the largest curtain of falling water in the world.',
  },
  {
    id: 'niagara-falls',
    name: 'Niagara Falls (Horseshoe Falls)',
    category: 'Natural',
    country: 'Canada / United States',
    lat: 43.0799,
    lon: -79.0747,
    alt: 800,
    pitch: -28,
    heading: 45,
    description: 'Massive group of three waterfalls at the southern end of Niagara Gorge, spanning Ontario and New York.',
  },
  {
    id: 'table-mountain',
    name: 'Table Mountain',
    category: 'Natural',
    country: 'South Africa',
    lat: -33.9628,
    lon: 18.4098,
    alt: 1800,
    pitch: -25,
    heading: 170,
    description: 'Flat-topped mountain forming a prominent landmark overlooking Cape Town in South Africa.',
  },
  {
    id: 'easter-island',
    name: 'Easter Island (Rapa Nui Moai)',
    category: 'Wonder',
    country: 'Chile',
    lat: -27.1212,
    lon: -109.3667,
    alt: 900,
    pitch: -25,
    heading: 140,
    description: 'Isolated Polynesian island famous for nearly 1,000 monumental monolithic human figures called moai.',
  },
  {
    id: 'kilimanjaro-poi',
    name: 'Mount Kilimanjaro',
    category: 'Natural',
    country: 'Tanzania',
    lat: -3.0674,
    lon: 37.3556,
    alt: 3500,
    pitch: -20,
    heading: 180,
    description: 'Dormant volcano in Tanzania and the highest single free-standing mountain in the world at 5,895 meters.',
  },
];

/** Merge city POIs into the dataset for complete global coverage */
function getAllPois() {
  const list = [...GLOBAL_POIS];
  const seenNames = new Set(list.map((p) => p.name.toLowerCase()));

  for (const [cityId, city] of Object.entries(CITY_POIS)) {
    for (let i = 0; i < (city.pois || []).length; i++) {
      const p = city.pois[i];
      if (!seenNames.has(p.name.toLowerCase())) {
        seenNames.add(p.name.toLowerCase());
        list.push({
          id: `${cityId}-${i}`,
          name: p.name,
          category: 'Landmark',
          country: city.name,
          lat: p.lat,
          lon: p.lon,
          alt: p.alt || 550,
          pitch: p.pitch || -25,
          heading: p.heading || 0,
          description: `Famous landmark in ${city.name}.`,
        });
      }
    }
  }
  return list;
}

const state = {
  viewer: null,
  dataSource: null,
  enabled: false,
  records: [],
  recordById: new Map(),
  selectedId: null,
  clickHandler: null,
};

function handlePick(click) {
  if (!state.enabled || !state.viewer) return;
  const scene = state.viewer.scene;

  const picked = scene.pick(click.position, PICK_TOLERANCE_PX, PICK_TOLERANCE_PX)
    || scene.pick(click.position);

  if (picked?.id && typeof picked.id.id === 'string' && picked.id.id.startsWith('poi:')) {
    const poiId = picked.id.id.replace('poi:', '');
    const poi = state.recordById.get(poiId);
    if (poi) {
      state.selectedId = poiId;
      selectEntityContext(LAYER_ID, poiId);

      // Fly camera to cinematic vantage point
      flyToLandmark(state.viewer, poi.lat, poi.lon, {
        range: poi.alt,
        pitch: poi.pitch,
        heading: poi.heading,
        buildingHeight: 30,
        duration: 2.5,
      });
    }
  }
}

export const poiLayer = {
  id: LAYER_ID,
  name: 'Points of Interest',
  icon: '📍',
  source: 'Curated World Landmarks',
  updateInterval: 86400000,
  showInTogglePanel: true,

  get enabled() {
    return state.enabled;
  },

  get stats() {
    return {
      count: state.records.length,
      lastUpdate: new Date(),
      error: null,
      loading: false,
    };
  },

  init(viewer) {
    state.viewer = viewer;
    state.dataSource = new Cesium.CustomDataSource(LAYER_ID);
    state.dataSource.show = false;
    viewer.dataSources.add(state.dataSource);

    registerPickOwner(LAYER_ID, (picked) => (
      picked?.id && typeof picked.id.id === 'string' && picked.id.id.startsWith('poi:')
    ));

    state.clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    state.clickHandler.setInputAction(handlePick, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    console.log('[Data:POI] Initialized');
  },

  enable(viewer) {
    state.enabled = true;
    if (state.dataSource) state.dataSource.show = true;

    if (state.records.length === 0) {
      const allPois = getAllPois();
      state.records = allPois;
      state.recordById.clear();
      removeEntityContextsForLayer(LAYER_ID);

      for (const poi of allPois) {
        state.recordById.set(poi.id, poi);

        const iconUri = poi.category === 'Wonder' ? WONDER_ICON
          : (poi.category === 'Natural' ? NATURAL_ICON : LANDMARK_ICON);

        const pos = Cesium.Cartesian3.fromDegrees(poi.lon, poi.lat, 0);

        state.dataSource.entities.add({
          id: `poi:${poi.id}`,
          name: poi.name,
          position: pos,
          billboard: {
            image: iconUri,
            width: 28,
            height: 32,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 8000000),
          },
          label: {
            text: poi.name,
            font: '11px "JetBrains Mono", monospace',
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 3,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.TOP,
            pixelOffset: new Cesium.Cartesian2(0, 4),
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 600000),
          },
          properties: {
            raw: poi,
            category: poi.category,
            country: poi.country,
          },
        });

        registerEntityContext({
          layerId: LAYER_ID,
          entityId: poi.id,
          title: poi.name,
          subtitle: `${poi.category} · ${poi.country}`,
          accent: poi.category === 'Wonder' ? '#ffaa00' : '#00d4ff',
          sections: [
            {
              title: 'Location Details',
              rows: [
                { label: 'Category', value: poi.category },
                { label: 'Location', value: poi.country },
                { label: 'Coordinates', value: `${poi.lat.toFixed(4)}°, ${poi.lon.toFixed(4)}°` },
              ],
            },
            ...(poi.description ? [{
              title: 'Information',
              rows: [{ label: 'Overview', value: poi.description }],
            }] : []),
          ],
        });
      }
    }
  },

  disable(viewer) {
    state.enabled = false;
    if (state.dataSource) state.dataSource.show = false;
    clearSelectedEntityContextForLayer(LAYER_ID);
  },

  update(viewer) {},

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

export default poiLayer;
