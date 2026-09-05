/**
 * all-systems-go.test.mjs — Automated Unit Test Suite for God's Eye View
 *
 * Runs as part of `npm test` via the Node test runner to enforce
 * that all systems are go, all 20 data layers satisfy their contracts,
 * local datasets exist and parse cleanly, and the Core Bridge facade is operational.
 *
 * @module test/all-systems-go.test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  checkCoreBridge,
  checkLayerContracts,
  checkDataAvailability,
  checkNavigationAndGeocoding,
  checkModernUI,
  runAllSystemsCheck,
  getAllLayerModules,
} from './all-systems-go.mjs';

import { LAYER_STATE_REGISTRY } from '../src/data/layerState.js';

test('System 1: Core Bridge & Telemetry Engine', () => {
  const checks = checkCoreBridge();
  const failed = checks.filter((c) => c.status === 'fail');
  assert.equal(failed.length, 0, `Core Bridge checks failed: ${JSON.stringify(failed)}`);
  assert.ok(checks.length >= 5, 'Expected at least 5 core bridge checks');
});

test('System 2: 20/20 Data Layers Contract & Registry Synchronization', () => {
  const modules = getAllLayerModules();
  assert.equal(modules.length, 20, 'Expected exactly 20 data layers registered');

  const registryIds = LAYER_STATE_REGISTRY.map((entry) => entry.id);
  const moduleIds = modules.map((m) => m.id);

  assert.deepEqual(
    [...registryIds].sort(),
    [...moduleIds].sort(),
    'All 20 layers in LAYER_STATE_REGISTRY must match layer module implementations',
  );

  const checks = checkLayerContracts();
  const failed = checks.filter((c) => c.status === 'fail');
  assert.equal(failed.length, 0, `Layer contract checks failed: ${JSON.stringify(failed)}`);
});

test('System 3: Local Datasets & Asset Integrity', () => {
  const checks = checkDataAvailability();
  const failed = checks.filter((c) => c.status === 'fail');
  assert.equal(failed.length, 0, `Dataset availability checks failed: ${JSON.stringify(failed)}`);
});

test('System 4: Navigation Matrix & Geocoding Engine', () => {
  const checks = checkNavigationAndGeocoding();
  const failed = checks.filter((c) => c.status === 'fail');
  assert.equal(failed.length, 0, `Navigation checks failed: ${JSON.stringify(failed)}`);
});

test('System 5: Modern UI Shell & Decluttering Targets', () => {
  const checks = checkModernUI();
  const failed = checks.filter((c) => c.status === 'fail');
  assert.equal(failed.length, 0, `Modern UI checks failed: ${JSON.stringify(failed)}`);
});

test('Overall: All Systems Are Go Diagnostic Suite', () => {
  const diagnostic = runAllSystemsCheck({ verbose: false });
  assert.equal(diagnostic.failed, 0, `Expected 0 failed checks, found ${diagnostic.failed}`);
  assert.ok(diagnostic.passed >= 38, `Expected at least 38 passed checks, found ${diagnostic.passed}`);
  assert.equal(diagnostic.success, true, 'Diagnostic status must be success=true');
});
