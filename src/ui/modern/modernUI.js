/**
 * modernUI.js — Decluttered Modern UI for God's Eye View
 *
 * Implements:
 * 1. Streamlined Top Bar with unified Search.
 * 2. Expanding scrollable "VIEWS" dropdown (Planetary, Cities, Curated Landmarks, Cockpit).
 * 3. Expanding scrollable "LAYERS" drawer (Categorized: Air, Sea, Ground, Space, Earth, Reference)
 *    with live status dots, entity counts, search filter, and instant toggle switches.
 * 4. Dedicated floating "ITEM DATA" inspector window with live telemetry (speed, alt, distance, heading).
 * 5. Full-screen CCTV popup modal with live frame, camera switching, calibration, and ESC-to-dismiss.
 *
 * Connects directly through gevBridge (the Interface Fetcher) for clean separation of concerns.
 *
 * @module modernUI
 */

import { gevBridge, LAYER_CATEGORIES, STYLE_PRESETS } from '../../core/gevBridge.js';

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatCount(count) {
  if (count === null || count === undefined || count < 0) return '—';
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return String(count);
}

export class ModernUI {
  constructor() {
    this.bridge = gevBridge;
    this.activeModal = null;
    this.viewsMenuOpen = false;
    this.layersDrawerOpen = false;
    this.stylesMenuOpen = false;
    this.cctvModalOpen = false;

    this.rootEl = null;
    this._unsubscribers = [];
  }

  /**
   * Initializes and mounts the modern UI onto the document.
   */
  mount() {
    if (document.getElementById('modern-ui-root')) return;

    // Inject Modern UI markup
    this.rootEl = document.createElement('div');
    this.rootEl.id = 'modern-ui-root';
    this.rootEl.className = 'modern-ui-root';
    this.rootEl.innerHTML = this._buildMarkup();
    document.body.appendChild(this.rootEl);

    // Bind all interactive controls
    this._bindViewsMenu();
    this._bindLayersDrawer();
    this._bindStylesMenu();
    this._bindSearchBar();
    this._bindItemInspector();
    this._bindCctvModal();
    this._bindKeyboardShortcuts();
    this._bindGlobalDismiss();

    // Declutter legacy duplicate elements from view
    this._applyDeclutter();

    console.info('[ModernUI] Mounted decluttered UI successfully');
  }

  /**
   * Cleans up and unmounts the modern UI.
   */
  unmount() {
    for (const unsub of this._unsubscribers) {
      try { unsub(); } catch {}
    }
    this._unsubscribers = [];

    if (this.rootEl) {
      this.rootEl.remove();
      this.rootEl = null;
    }
  }

  _buildMarkup() {
    return `
      <!-- Top Navigation & Control Header -->
      <header id="modern-top-nav" class="modern-top-nav" aria-label="Main Navigation">
        <div class="modern-nav-left">
          <div class="modern-brand">
            <span class="modern-brand-logo" aria-hidden="true"><img src="/logo.svg" alt="" /></span>
            <div class="modern-brand-text">
              <span class="modern-brand-title">GOD'S EYE <strong>VIEW</strong></span>
              <span class="modern-brand-subtitle">PLANETARY INTELLIGENCE</span>
            </div>
          </div>

          <!-- Views Button with Expanding Menu -->
          <div class="modern-dropdown-wrap">
            <button id="modern-views-btn" class="modern-nav-btn" type="button" aria-expanded="false" aria-controls="modern-views-menu">
              <span class="material-symbols-outlined nav-icon" aria-hidden="true">explore</span>
              <span class="nav-btn-label">VIEWS</span>
              <span class="material-symbols-outlined nav-chevron" aria-hidden="true">arrow_drop_down</span>
            </button>
            <div id="modern-views-menu" class="modern-popover modern-views-menu" hidden>
              <div class="modern-popover-header">
                <span class="popover-title">EXPLORE VIEWS</span>
                <input type="text" id="modern-views-filter" class="modern-filter-input" placeholder="Search views & landmarks..." autocomplete="off" />
              </div>
              <div id="modern-views-content" class="modern-views-content custom-scrollbar">
                <!-- Dynamically populated -->
              </div>
            </div>
          </div>

          <!-- Layers Button with Expanding Drawer -->
          <div class="modern-dropdown-wrap">
            <button id="modern-layers-btn" class="modern-nav-btn" type="button" aria-expanded="false" aria-controls="modern-layers-drawer">
              <span class="material-symbols-outlined nav-icon" aria-hidden="true">layers</span>
              <span class="nav-btn-label">LAYERS</span>
              <span id="modern-layers-active-badge" class="modern-count-badge">0</span>
              <span class="material-symbols-outlined nav-chevron" aria-hidden="true">arrow_drop_down</span>
            </button>
            <div id="modern-layers-drawer" class="modern-popover modern-layers-drawer" hidden>
              <div class="modern-popover-header">
                <div class="drawer-title-row">
                  <span class="popover-title">DATA OVERLAYS</span>
                  <div class="drawer-header-actions">
                    <button id="modern-layers-clear-btn" class="modern-sub-btn" type="button" title="Turn off all active layers">CLEAR ALL</button>
                  </div>
                </div>
                <input type="text" id="modern-layers-filter" class="modern-filter-input" placeholder="Filter layers..." autocomplete="off" />
              </div>
              <div id="modern-layers-content" class="modern-layers-content custom-scrollbar">
                <!-- Dynamically populated by category -->
              </div>
            </div>
          </div>

          <!-- Visual Styles Dropdown -->
          <div class="modern-dropdown-wrap">
            <button id="modern-styles-btn" class="modern-nav-btn" type="button" aria-expanded="false" aria-controls="modern-styles-menu">
              <span class="material-symbols-outlined nav-icon" aria-hidden="true">palette</span>
              <span id="modern-active-style-label" class="nav-btn-label">STYLE: NORMAL</span>
              <span class="material-symbols-outlined nav-chevron" aria-hidden="true">arrow_drop_down</span>
            </button>
            <div id="modern-styles-menu" class="modern-popover modern-styles-menu" hidden>
              <div class="modern-popover-header">
                <span class="popover-title">VISUAL PRESET SHADERS</span>
              </div>
              <div id="modern-styles-content" class="modern-styles-grid">
                <!-- Dynamically populated -->
              </div>
            </div>
          </div>
        </div>

        <!-- Center Search Bar -->
        <div class="modern-nav-center">
          <div class="modern-search-wrap">
            <span class="material-symbols-outlined search-icon" aria-hidden="true">search</span>
            <input type="text" id="modern-search-input" class="modern-search-input" placeholder="Search any city, landmark, or coordinates..." autocomplete="off" spellcheck="false" />
            <button id="modern-search-clear" class="modern-search-clear" type="button" aria-label="Clear search" hidden>✕</button>
            <div id="modern-search-dropdown" class="modern-search-dropdown custom-scrollbar" hidden></div>
          </div>
        </div>

        <!-- Right Quick Actions -->
        <div class="modern-nav-right">
          <button id="modern-cctv-quick-btn" class="modern-icon-btn" type="button" title="Open Full-Screen CCTV surveillance">
            <span class="material-symbols-outlined" aria-hidden="true">videocam</span>
          </button>
          <button id="modern-reset-globe-btn" class="modern-icon-btn" type="button" title="Return to Full Globe view">
            <span class="material-symbols-outlined" aria-hidden="true">public</span>
          </button>
          <button id="modern-share-btn" class="modern-icon-btn" type="button" title="Copy shareable camera and layer link">
            <span class="material-symbols-outlined" aria-hidden="true">share</span>
          </button>
          <button id="modern-clean-ui-btn" class="modern-icon-btn" type="button" title="Toggle Clean View (Hide UI chrome)">
            <span class="material-symbols-outlined" aria-hidden="true">fullscreen</span>
          </button>
        </div>
      </header>

      <!-- Floating Current Item Data Inspector Window -->
      <aside id="modern-item-inspector" class="modern-item-inspector" aria-label="Selected Item Telemetry" hidden>
        <div class="inspector-card">
          <header class="inspector-header">
            <div class="inspector-title-block">
              <span id="inspector-category-badge" class="inspector-category">AIRCRAFT</span>
              <h3 id="inspector-title" class="inspector-title">—</h3>
            </div>
            <div class="inspector-header-actions">
              <button id="inspector-cockpit-btn" class="inspector-action-pill" type="button" title="Enter First-Person Cockpit View" hidden>
                <span class="material-symbols-outlined" aria-hidden="true">flight</span> COCKPIT
              </button>
              <button id="inspector-close-btn" class="inspector-close-btn" type="button" aria-label="Deselect item">✕</button>
            </div>
          </header>

          <div class="inspector-coordinates-row">
            <span class="material-symbols-outlined coord-icon" aria-hidden="true">location_on</span>
            <span id="inspector-coordinates" class="inspector-coords">--° · --°</span>
            <span id="inspector-operator" class="inspector-operator"></span>
          </div>

          <div class="inspector-metrics-grid">
            <div class="metric-cell">
              <span class="metric-label">ALTITUDE</span>
              <strong id="inspector-altitude" class="metric-value">—</strong>
              <small class="metric-unit">FT</small>
            </div>
            <div class="metric-cell">
              <span class="metric-label">GROUND SPEED</span>
              <strong id="inspector-speed" class="metric-value">—</strong>
              <small class="metric-unit">KTS</small>
            </div>
            <div class="metric-cell">
              <span class="metric-label">HEADING</span>
              <strong id="inspector-heading" class="metric-value">—</strong>
              <small class="metric-unit">DEG</small>
            </div>
            <div class="metric-cell">
              <span class="metric-label">CAMERA DIST</span>
              <strong id="inspector-distance" class="metric-value">—</strong>
              <small class="metric-unit">KM</small>
            </div>
          </div>

          <footer class="inspector-footer">
            <button id="inspector-flyto-btn" class="inspector-btn primary" type="button">
              <span class="material-symbols-outlined" aria-hidden="true">my_location</span> FOCUS
            </button>
            <button id="inspector-untrack-btn" class="inspector-btn secondary" type="button">
              <span class="material-symbols-outlined" aria-hidden="true">close</span> UNTRACK
            </button>
          </footer>
        </div>
      </aside>

      <!-- Full-Screen CCTV Surveillance Modal -->
      <div id="modern-cctv-modal" class="modern-cctv-modal" role="dialog" aria-modal="true" aria-label="Live CCTV Full Screen Surveillance" hidden>
        <div class="cctv-modal-backdrop"></div>
        <div class="cctv-modal-content">
          <header class="cctv-modal-header">
            <div class="cctv-modal-title-group">
              <span class="cctv-live-badge"><i class="live-pulse"></i> LIVE CCTV SURVEILLANCE</span>
              <h2 id="cctv-modal-cam-name" class="cctv-modal-name">SELECTING FEED...</h2>
            </div>
            <div class="cctv-modal-meta">
              <span id="cctv-modal-status-badge" class="cctv-status-pill">SOURCE · ACTIVE</span>
              <span id="cctv-modal-clock" class="cctv-clock">--:--:-- UTC</span>
              <button id="cctv-modal-close" class="cctv-close-btn" type="button" aria-label="Close CCTV Modal" title="Close (ESC)">✕</button>
            </div>
          </header>

          <div class="cctv-viewport-frame">
            <div class="cctv-scanlines" aria-hidden="true"></div>
            <div class="cctv-reticle-tl" aria-hidden="true"></div>
            <div class="cctv-reticle-tr" aria-hidden="true"></div>
            <div class="cctv-reticle-bl" aria-hidden="true"></div>
            <div class="cctv-reticle-br" aria-hidden="true"></div>
            <img id="cctv-modal-img" class="cctv-modal-img" alt="Full Screen CCTV Camera Feed" />
            <div id="cctv-modal-loading" class="cctv-modal-loading" hidden>
              <div class="modern-spinner"></div>
              <span>CONNECTING LIVE OPTICAL FEED...</span>
            </div>
          </div>

          <footer class="cctv-modal-footer">
            <div class="cctv-controls-left">
              <button id="cctv-modal-prev" class="cctv-nav-btn" type="button" title="Previous Camera">
                <span class="material-symbols-outlined" aria-hidden="true">chevron_left</span> PREV
              </button>
              <select id="cctv-modal-select" class="cctv-select-input" aria-label="Select CCTV Camera"></select>
              <button id="cctv-modal-next" class="cctv-nav-btn" type="button" title="Next Camera">
                NEXT <span class="material-symbols-outlined" aria-hidden="true">chevron_right</span>
              </button>
            </div>
            <div class="cctv-controls-right">
              <button id="cctv-modal-flyto" class="cctv-action-btn" type="button" title="Align 3D Globe with Camera Pose">
                <span class="material-symbols-outlined" aria-hidden="true">center_focus_strong</span> ALIGN GLOBE
              </button>
              <span class="cctv-hint">ESC TO EXIT FULL SCREEN</span>
            </div>
          </footer>
        </div>
      </div>
    `;
  }

  // =========================================================================
  // 1. VIEWS MENU POPULATION & ACTIONS
  // =========================================================================

  _bindViewsMenu() {
    const btn = document.getElementById('modern-views-btn');
    const menu = document.getElementById('modern-views-menu');
    const content = document.getElementById('modern-views-content');
    const filterInput = document.getElementById('modern-views-filter');

    if (!btn || !menu || !content) return;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleViewsMenu();
    });

    const renderViews = (filterText = '') => {
      const views = this.bridge.getViews();
      const q = filterText.trim().toLowerCase();
      content.innerHTML = '';

      // Section A: Planetary
      const filteredPlanetary = views.planetary.filter((v) => !q || v.name.toLowerCase().includes(q) || v.detail.toLowerCase().includes(q));
      if (filteredPlanetary.length > 0) {
        const sec = document.createElement('div');
        sec.className = 'views-section';
        sec.innerHTML = `<div class="views-section-title">PLANETARY OVERVIEW</div>`;
        const list = document.createElement('div');
        list.className = 'views-list-grid';

        for (const v of filteredPlanetary) {
          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'view-card-item planetary';
          item.innerHTML = `
            <span class="material-symbols-outlined view-icon" aria-hidden="true">${v.icon}</span>
            <div class="view-item-meta">
              <strong>${escapeHtml(v.name)}</strong>
              <small>${escapeHtml(v.detail)}</small>
            </div>
          `;
          item.addEventListener('click', () => {
            this.bridge.flyToView(v.id);
            this.toggleViewsMenu(false);
          });
          list.appendChild(item);
        }
        sec.appendChild(list);
        content.appendChild(sec);
      }

      // Section B: Major Metros
      const filteredMetros = views.metros.filter((m) => !q || m.name.toLowerCase().includes(q));
      if (filteredMetros.length > 0) {
        const sec = document.createElement('div');
        sec.className = 'views-section';
        sec.innerHTML = `<div class="views-section-title">METRO REGIONS & CITIES</div>`;
        const list = document.createElement('div');
        list.className = 'views-list-grid';

        for (const m of filteredMetros) {
          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'view-card-item city';
          item.innerHTML = `
            <span class="material-symbols-outlined view-icon" aria-hidden="true">${m.icon}</span>
            <div class="view-item-meta">
              <strong>${escapeHtml(m.name)}</strong>
              <small>${escapeHtml(m.detail)}</small>
            </div>
          `;
          item.addEventListener('click', () => {
            this.bridge.flyToView(m.id);
            this.toggleViewsMenu(false);
          });
          list.appendChild(item);
        }
        sec.appendChild(list);
        content.appendChild(sec);
      }

      // Section C: World Landmarks
      const filteredLandmarks = views.landmarks.filter((l) => !q || l.name.toLowerCase().includes(q) || l.country.toLowerCase().includes(q));
      if (filteredLandmarks.length > 0) {
        const sec = document.createElement('div');
        sec.className = 'views-section';
        sec.innerHTML = `<div class="views-section-title">CURATED WORLD WONDERS & LANDMARKS</div>`;
        const list = document.createElement('div');
        list.className = 'views-list-grid compact';

        for (const l of filteredLandmarks) {
          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'view-card-item landmark';
          item.innerHTML = `
            <span class="material-symbols-outlined view-icon" aria-hidden="true">${l.icon}</span>
            <div class="view-item-meta">
              <strong>${escapeHtml(l.name)}</strong>
              <small>${escapeHtml(l.country || l.subCategory)}</small>
            </div>
          `;
          item.addEventListener('click', () => {
            this.bridge.flyToView(l);
            this.toggleViewsMenu(false);
          });
          list.appendChild(item);
        }
        sec.appendChild(list);
        content.appendChild(sec);
      }
    };

    renderViews();

    if (filterInput) {
      filterInput.addEventListener('input', () => {
        renderViews(filterInput.value);
      });
    }
  }

  toggleViewsMenu(forceState = undefined) {
    const btn = document.getElementById('modern-views-btn');
    const menu = document.getElementById('modern-views-menu');
    if (!btn || !menu) return;

    this.viewsMenuOpen = forceState !== undefined ? Boolean(forceState) : !this.viewsMenuOpen;
    btn.classList.toggle('active', this.viewsMenuOpen);
    btn.setAttribute('aria-expanded', String(this.viewsMenuOpen));
    menu.hidden = !this.viewsMenuOpen;

    if (this.viewsMenuOpen) {
      this.toggleLayersDrawer(false);
      this.toggleStylesMenu(false);
      const filter = document.getElementById('modern-views-filter');
      if (filter) {
        filter.value = '';
        setTimeout(() => filter.focus(), 100);
      }
    }
  }

  // =========================================================================
  // 2. LAYERS DRAWER POPULATION & TOGGLES
  // =========================================================================

  _bindLayersDrawer() {
    const btn = document.getElementById('modern-layers-btn');
    const drawer = document.getElementById('modern-layers-drawer');
    const content = document.getElementById('modern-layers-content');
    const filterInput = document.getElementById('modern-layers-filter');
    const clearBtn = document.getElementById('modern-layers-clear-btn');
    const activeBadge = document.getElementById('modern-layers-active-badge');

    if (!btn || !drawer || !content) return;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleLayersDrawer();
    });

    if (clearBtn) {
      clearBtn.addEventListener('click', async () => {
        await this.bridge.clearAllLayers();
        renderDrawer(filterInput?.value || '');
      });
    }

    const renderDrawer = (filterText = '') => {
      const categorized = this.bridge.getCategorizedLayers();
      const q = filterText.trim().toLowerCase();
      content.innerHTML = '';

      let totalActive = 0;

      for (const [catKey, category] of Object.entries(categorized)) {
        const filteredLayers = category.layers.filter((l) =>
          !q || l.name.toLowerCase().includes(q) || l.description.toLowerCase().includes(q)
        );

        if (filteredLayers.length === 0) continue;

        const sec = document.createElement('div');
        sec.className = 'layer-category-section';

        sec.innerHTML = `
          <div class="category-header">
            <span class="material-symbols-outlined category-icon" aria-hidden="true">${category.icon || 'folder'}</span>
            <span class="category-name">${escapeHtml(category.label)}</span>
          </div>
        `;

        const group = document.createElement('div');
        group.className = 'layer-item-group';

        for (const layer of filteredLayers) {
          if (layer.enabled) totalActive += 1;

          const row = document.createElement('div');
          row.className = `layer-item-row${layer.enabled ? ' active' : ''}`;
          row.dataset.layerId = layer.id;

          const statusClass = layer.loading ? 'loading' : layer.status === 'stale' ? 'stale' : layer.enabled ? 'nominal' : 'disabled';

          row.innerHTML = `
            <div class="layer-item-info">
              <span class="layer-status-dot ${statusClass}" aria-hidden="true"></span>
              <div class="layer-text-wrap">
                <span class="layer-title">${escapeHtml(layer.name)}</span>
                ${layer.description ? `<small class="layer-desc">${escapeHtml(layer.description)}</small>` : ''}
              </div>
            </div>
            <div class="layer-item-ctrls">
              <span class="layer-count-pill" title="Live visible entities">${formatCount(layer.count)}</span>
              <button class="layer-toggle-switch${layer.enabled ? ' on' : ''}" type="button" role="switch" aria-checked="${layer.enabled}">
                <span class="switch-slider"></span>
              </button>
            </div>
          `;

          const toggleBtn = row.querySelector('.layer-toggle-switch');
          toggleBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            toggleBtn.disabled = true;
            try {
              const nextState = await this.bridge.toggleLayer(layer.id);
              row.classList.toggle('active', nextState);
              toggleBtn.classList.toggle('on', nextState);
              toggleBtn.setAttribute('aria-checked', String(nextState));
              renderDrawer(filterInput?.value || '');
            } finally {
              toggleBtn.disabled = false;
            }
          });

          group.appendChild(row);
        }

        sec.appendChild(group);
        content.appendChild(sec);
      }

      if (activeBadge) {
        activeBadge.textContent = String(totalActive);
        activeBadge.classList.toggle('has-active', totalActive > 0);
      }
    };

    renderDrawer();

    if (filterInput) {
      filterInput.addEventListener('input', () => {
        renderDrawer(filterInput.value);
      });
    }

    // Subscribe to real-time layer updates
    this._unsubscribers.push(
      this.bridge.subscribeLayers(() => {
        renderDrawer(filterInput?.value || '');
      })
    );
  }

  toggleLayersDrawer(forceState = undefined) {
    const btn = document.getElementById('modern-layers-btn');
    const drawer = document.getElementById('modern-layers-drawer');
    if (!btn || !drawer) return;

    this.layersDrawerOpen = forceState !== undefined ? Boolean(forceState) : !this.layersDrawerOpen;
    btn.classList.toggle('active', this.layersDrawerOpen);
    btn.setAttribute('aria-expanded', String(this.layersDrawerOpen));
    drawer.hidden = !this.layersDrawerOpen;

    if (this.layersDrawerOpen) {
      this.toggleViewsMenu(false);
      this.toggleStylesMenu(false);
      const filter = document.getElementById('modern-layers-filter');
      if (filter) {
        filter.value = '';
        setTimeout(() => filter.focus(), 100);
      }
    }
  }

  // =========================================================================
  // 3. VISUAL STYLES SHADER MENU
  // =========================================================================

  _bindStylesMenu() {
    const btn = document.getElementById('modern-styles-btn');
    const menu = document.getElementById('modern-styles-menu');
    const content = document.getElementById('modern-styles-content');
    const activeLabel = document.getElementById('modern-active-style-label');

    if (!btn || !menu || !content) return;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleStylesMenu();
    });

    const updateStylesGrid = () => {
      const active = this.bridge.getActiveStyle();
      content.innerHTML = '';

      if (activeLabel) {
        const found = STYLE_PRESETS.find((s) => s.id === active);
        activeLabel.textContent = `STYLE: ${(found?.label || active).toUpperCase()}`;
      }

      for (const preset of STYLE_PRESETS) {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = `style-card-btn${preset.id === active ? ' active' : ''}`;
        item.innerHTML = `
          <div class="style-card-top">
            <span class="style-icon">${preset.icon}</span>
            <strong>${escapeHtml(preset.label)}</strong>
          </div>
          <p class="style-desc">${escapeHtml(preset.description)}</p>
        `;
        item.addEventListener('click', () => {
          this.bridge.setStyle(preset.id);
          this.toggleStylesMenu(false);
          updateStylesGrid();
        });
        content.appendChild(item);
      }
    };

    updateStylesGrid();

    this._unsubscribers.push(
      this.bridge.subscribeStyles(() => {
        updateStylesGrid();
      })
    );
  }

  toggleStylesMenu(forceState = undefined) {
    const btn = document.getElementById('modern-styles-btn');
    const menu = document.getElementById('modern-styles-menu');
    if (!btn || !menu) return;

    this.stylesMenuOpen = forceState !== undefined ? Boolean(forceState) : !this.stylesMenuOpen;
    btn.classList.toggle('active', this.stylesMenuOpen);
    btn.setAttribute('aria-expanded', String(this.stylesMenuOpen));
    menu.hidden = !this.stylesMenuOpen;

    if (this.stylesMenuOpen) {
      this.toggleViewsMenu(false);
      this.toggleLayersDrawer(false);
    }
  }

  // =========================================================================
  // 4. UNIFIED LOCATION SEARCH
  // =========================================================================

  _bindSearchBar() {
    const input = document.getElementById('modern-search-input');
    const clearBtn = document.getElementById('modern-search-clear');
    const dropdown = document.getElementById('modern-search-dropdown');

    if (!input) return;

    let debounce = null;

    const closeDropdown = () => {
      if (dropdown) {
        dropdown.hidden = true;
        dropdown.innerHTML = '';
      }
    };

    input.addEventListener('input', () => {
      const val = input.value.trim();
      if (clearBtn) clearBtn.hidden = val.length === 0;

      clearTimeout(debounce);
      if (val.length >= 2) {
        debounce = setTimeout(async () => {
          const suggestions = await this.bridge.getSearchSuggestions(val);
          if (!dropdown) return;
          dropdown.innerHTML = '';

          if (suggestions.length === 0) {
            closeDropdown();
            return;
          }

          for (const s of suggestions) {
            const row = document.createElement('div');
            row.className = 'search-result-row';
            row.innerHTML = `
              <span class="material-symbols-outlined item-icon" aria-hidden="true">${s.icon || 'place'}</span>
              <div class="item-text">
                <span class="item-name">${escapeHtml(s.name)}</span>
                <small class="item-detail">${escapeHtml(s.detail)}</small>
              </div>
              <span class="item-badge">${escapeHtml(s.badge || 'LOC')}</span>
            `;

            row.addEventListener('click', () => {
              input.value = s.name;
              closeDropdown();
              if (s.type === 'city') {
                this.bridge.flyToView(s.id);
              } else if (s.type === 'poi') {
                this.bridge.flyToView(s.poi);
              } else {
                this.bridge.searchLocation(s.name);
              }
            });

            dropdown.appendChild(row);
          }

          dropdown.hidden = false;
        }, 180);
      } else {
        closeDropdown();
      }
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const val = input.value.trim();
        if (val) {
          closeDropdown();
          this.bridge.searchLocation(val);
        }
      } else if (e.key === 'Escape') {
        closeDropdown();
        input.value = '';
        if (clearBtn) clearBtn.hidden = true;
        input.blur();
      }
    });

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        input.value = '';
        clearBtn.hidden = true;
        closeDropdown();
        input.focus();
      });
    }

    // Quick Action Bar Buttons
    document.getElementById('modern-reset-globe-btn')?.addEventListener('click', () => {
      this.bridge.flyToView('globe');
    });

    document.getElementById('modern-share-btn')?.addEventListener('click', () => {
      document.getElementById('share-btn')?.click();
    });

    document.getElementById('modern-clean-ui-btn')?.addEventListener('click', () => {
      document.getElementById('clean-view-toggle')?.click();
    });

    document.getElementById('modern-cctv-quick-btn')?.addEventListener('click', () => {
      this.openCctvModal();
    });
  }

  // =========================================================================
  // 5. CURRENT ITEM DATA INSPECTOR WINDOW
  // =========================================================================

  _bindItemInspector() {
    const inspector = document.getElementById('modern-item-inspector');
    const titleEl = document.getElementById('inspector-title');
    const categoryEl = document.getElementById('inspector-category-badge');
    const coordsEl = document.getElementById('inspector-coordinates');
    const operatorEl = document.getElementById('inspector-operator');
    const altEl = document.getElementById('inspector-altitude');
    const speedEl = document.getElementById('inspector-speed');
    const headingEl = document.getElementById('inspector-heading');
    const distEl = document.getElementById('inspector-distance');
    const cockpitBtn = document.getElementById('inspector-cockpit-btn');
    const closeBtn = document.getElementById('inspector-close-btn');
    const flyToBtn = document.getElementById('inspector-flyto-btn');
    const untrackBtn = document.getElementById('inspector-untrack-btn');

    if (!inspector) return;

    const renderItem = (item) => {
      if (!item) {
        inspector.hidden = true;
        return;
      }

      inspector.hidden = false;
      if (titleEl) titleEl.textContent = item.title || 'TARGET INSPECTION';
      if (categoryEl) categoryEl.textContent = String(item.category || 'OBJECT').toUpperCase();
      if (coordsEl) {
        coordsEl.textContent = (item.lat !== null && item.lon !== null)
          ? `${item.lat.toFixed(3)}° · ${item.lon.toFixed(3)}°`
          : 'COORDINATES PENDING';
      }
      if (operatorEl) operatorEl.textContent = item.operator ? `· ${item.operator}` : '';
      if (altEl) altEl.textContent = item.altFt !== null ? `${item.altFt.toLocaleString()}` : '—';
      if (speedEl) speedEl.textContent = item.speedKts !== null ? `${item.speedKts}` : '—';
      if (headingEl) headingEl.textContent = item.headingDeg !== null ? `${Math.round(item.headingDeg)}°` : '—';
      if (distEl) distEl.textContent = item.distanceKm !== null ? `${item.distanceKm.toLocaleString()}` : '—';

      if (cockpitBtn) {
        cockpitBtn.hidden = !item.canCockpit;
      }
    };

    if (cockpitBtn) {
      cockpitBtn.addEventListener('click', () => {
        this.bridge.enterCockpit();
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.bridge.untrack();
      });
    }

    if (untrackBtn) {
      untrackBtn.addEventListener('click', () => {
        this.bridge.untrack();
      });
    }

    if (flyToBtn) {
      flyToBtn.addEventListener('click', () => {
        const item = this.bridge.getActiveTracked();
        if (item && item.lat !== null && item.lon !== null) {
          this.bridge.flyToView({
            lat: item.lat,
            lon: item.lon,
            range: Math.max(800, (item.altFt || 1000) * 0.5),
            pitch: -30,
          });
        }
      });
    }

    this._unsubscribers.push(
      this.bridge.subscribeTrackedItem((item) => {
        renderItem(item);
      })
    );
  }

  // =========================================================================
  // 6. FULL-SCREEN CCTV MODAL
  // =========================================================================

  _bindCctvModal() {
    const modal = document.getElementById('modern-cctv-modal');
    const closeBtn = document.getElementById('cctv-modal-close');
    const prevBtn = document.getElementById('cctv-modal-prev');
    const nextBtn = document.getElementById('cctv-modal-next');
    const select = document.getElementById('cctv-modal-select');
    const flyToBtn = document.getElementById('cctv-modal-flyto');
    const frameImg = document.getElementById('cctv-modal-img');
    const camNameEl = document.getElementById('cctv-modal-cam-name');
    const statusBadge = document.getElementById('cctv-modal-status-badge');
    const clockEl = document.getElementById('cctv-modal-clock');

    if (!modal) return;

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.closeCctvModal();
      });
    }

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        this.bridge.cycleCctvCamera(-1);
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        this.bridge.cycleCctvCamera(1);
      });
    }

    if (select) {
      select.addEventListener('change', () => {
        this.bridge.selectCctvCamera(select.value);
      });
    }

    if (flyToBtn) {
      flyToBtn.addEventListener('click', () => {
        const state = this.bridge.getCctvState();
        if (state.activeCameraId) {
          this.bridge.selectCctvCamera(state.activeCameraId);
          this.closeCctvModal();
        }
      });
    }

    // Also wire the frame wrapper in the legacy CCTV panel to trigger fullscreen on click
    const legacyWrap = document.getElementById('cctv-frame-wrap');
    if (legacyWrap) {
      legacyWrap.title = 'Click to view full screen';
      legacyWrap.style.cursor = 'zoom-in';
      legacyWrap.addEventListener('click', () => {
        this.openCctvModal();
      });
    }

    const syncModal = (state) => {
      if (!this.cctvModalOpen) return;

      if (camNameEl) camNameEl.textContent = state.activeCameraName || 'CAMERA STREAM';
      if (statusBadge) statusBadge.textContent = state.sourceStatus || 'LIVE';

      if (frameImg && state.frameSrc) {
        frameImg.src = state.frameSrc;
      }

      if (select && state.cameras?.length > 0 && select.options.length !== state.cameras.length) {
        select.innerHTML = '';
        for (const cam of state.cameras) {
          const opt = document.createElement('option');
          opt.value = cam.id;
          opt.textContent = cam.name;
          opt.selected = cam.id === state.activeCameraId;
          select.appendChild(opt);
        }
      } else if (select && state.activeCameraId) {
        select.value = state.activeCameraId;
      }
    };

    // 1-second clock tick
    setInterval(() => {
      if (this.cctvModalOpen && clockEl) {
        const now = new Date();
        clockEl.textContent = `${now.toISOString().slice(11, 19)}Z`;
      }
    }, 1000);

    this._unsubscribers.push(
      this.bridge.subscribeCctv((state) => {
        syncModal(state);
      })
    );
  }

  openCctvModal() {
    const modal = document.getElementById('modern-cctv-modal');
    if (!modal) return;

    // Ensure CCTV layer is on
    if (!this.bridge.isLayerEnabled('cctv')) {
      this.bridge.toggleLayer('cctv', true);
    }

    this.cctvModalOpen = true;
    modal.hidden = false;
    document.body.classList.add('cctv-modal-active');

    const state = this.bridge.getCctvState();
    const frameImg = document.getElementById('cctv-modal-img');
    const camNameEl = document.getElementById('cctv-modal-cam-name');
    if (frameImg && state.frameSrc) frameImg.src = state.frameSrc;
    if (camNameEl) camNameEl.textContent = state.activeCameraName;
  }

  closeCctvModal() {
    const modal = document.getElementById('modern-cctv-modal');
    if (!modal) return;
    this.cctvModalOpen = false;
    modal.hidden = true;
    document.body.classList.remove('cctv-modal-active');
  }

  // =========================================================================
  // 7. KEYBOARD SHORTCUTS & GLOBAL DISMISS
  // =========================================================================

  _bindKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.cctvModalOpen) {
          e.preventDefault();
          e.stopPropagation();
          this.closeCctvModal();
          return;
        }
        if (this.viewsMenuOpen) {
          this.toggleViewsMenu(false);
          return;
        }
        if (this.layersDrawerOpen) {
          this.toggleLayersDrawer(false);
          return;
        }
        if (this.stylesMenuOpen) {
          this.toggleStylesMenu(false);
          return;
        }
      }
    });
  }

  _bindGlobalDismiss() {
    document.addEventListener('click', (e) => {
      const target = e.target;
      if (!target.closest('.modern-dropdown-wrap') && !target.closest('.modern-search-wrap')) {
        this.toggleViewsMenu(false);
        this.toggleLayersDrawer(false);
        this.toggleStylesMenu(false);
        const dropdown = document.getElementById('modern-search-dropdown');
        if (dropdown) dropdown.hidden = true;
      }
    });
  }

  // =========================================================================
  // 8. DECLUTTERING LEGACY DUPLICATES
  // =========================================================================

  _applyDeclutter() {
    // Hide old duplicate bars that are now superseded by the modern header & drawer
    const duplicateElements = [
      'top-view-bar',          // Replaced by modern-top-nav
      'dock-layers-bar',       // Replaced by modern LAYERS drawer
      'location-bar',          // Replaced by modern Views & Search
      'control-panel',         // Replaced by modern STYLES dropdown
      'command-dock',          // Redundant duplicate container
      'title-bar',             // Built cleanly into modern-top-nav brand header
      'style-indicator',       // Built into modern-top-nav style selector
      'top-center-actions',    // Actions available in modern-top-nav right rail
      'cctv-panel',            // Replaced by modern full-screen CCTV viewer modal
    ];

    for (const id of duplicateElements) {
      const el = document.getElementById(id);
      if (el) {
        el.style.display = 'none';
        el.setAttribute('aria-hidden', 'true');
      }
    }
  }
}

export const modernUI = new ModernUI();
export default modernUI;
