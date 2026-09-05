import test from 'node:test';
import assert from 'node:assert/strict';
import { gevBridge, LAYER_CATEGORIES, STYLE_PRESETS } from './gevBridge.js';

test('gevBridge has expected initial state and categories', () => {
  assert.ok(gevBridge);
  assert.equal(typeof gevBridge.init, 'function');
  assert.equal(typeof gevBridge.getLayers, 'function');
  assert.equal(typeof gevBridge.getViews, 'function');
  assert.equal(typeof gevBridge.getActiveTracked, 'function');
  assert.equal(typeof gevBridge.getCctvState, 'function');
  assert.equal(typeof gevBridge.getStyles, 'function');

  assert.ok(LAYER_CATEGORIES.aviation);
  assert.ok(LAYER_CATEGORIES.maritime_transit);
  assert.ok(LAYER_CATEGORIES.infrastructure);
  assert.ok(LAYER_CATEGORIES.space);
  assert.ok(LAYER_CATEGORIES.environment);
  assert.ok(LAYER_CATEGORIES.cartography);

  assert.equal(STYLE_PRESETS.length, 7);
});

test('gevBridge getViews returns planetary, metros, and landmarks', () => {
  const views = gevBridge.getViews();
  assert.ok(Array.isArray(views.planetary));
  assert.ok(Array.isArray(views.metros));
  assert.ok(Array.isArray(views.landmarks));
  assert.ok(views.metros.length >= 8);
  assert.ok(views.landmarks.length >= 10);
});
