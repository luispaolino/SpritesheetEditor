const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const html = fs.readFileSync(path.join(__dirname, '..', 'SpritesheetEditor.html'), 'utf8');
function sourceFunction(name) {
  const start = html.indexOf(`    function ${name}(`);
  assert.notEqual(start, -1, name);
  return html.slice(start, html.indexOf('\n    function ', start + 1));
}
function context(sx = 1, sy = sx) {
  return { sx, sy, rects: [], save() {}, restore() {}, clearRect() {},
    getTransform() { return { a: this.sx, d: this.sy }; },
    setTransform(a, _b, _c, d) { this.sx = a; this.sy = d; },
    fillRect(x, y, width, height) { this.rects.push([x * this.sx, y * this.sy, width * this.sx, height * this.sy]); }
  };
}
function editor() {
  const app = { state: { cageWidth: 6, cageHeight: 6, zoom: 40, rulersV: [], rulersH: [], showCageOverlay: true, showRulerOverlay: true },
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    hasFrames: () => true, spriteSheetBuilderPanelActive: () => false, activeRulerColor: () => 'pink', colorToCss: value => value,
    window: { devicePixelRatio: 1.25 }, normalizeScanlineOpacity: () => 30, applyReferenceCompositorMaskToOverlay() {}, drawSpriteSheetBuilderCageOverlay() {}
  };
  app.overlayRect = { left: 80.25, top: 40.5, width: 320, height: 320 };
  app.mainRect = { left: 100.25, top: 60.5, width: 240, height: 240 };
  for(const rect of [app.overlayRect,app.mainRect]) {
    Object.defineProperty(rect,'right',{get(){return this.left+this.width;}});Object.defineProperty(rect,'bottom',{get(){return this.top+this.height;}});
  }
  app.els = { mainCanvas: { getBoundingClientRect: () => app.mainRect }, canvasShell: { getBoundingClientRect: () => app.overlayRect } };
  app.previewFrameSize = app.activeGuideFrameSize = () => ({ width: app.state.cageWidth, height: app.state.cageHeight });
  vm.createContext(app);
  for (const name of ['guideThickness', 'guideDashLength', 'centeredGuideStart', 'centeredDashRuns',
    'drawDashedPixelH', 'drawDashedPixelV', 'drawCageGuide', 'drawRulers', 'overlayGuideMetrics',
    'pixelGuideContext', 'drawExtendedPixelRuler', 'drawTopCageGuide', 'drawTopRulers', 'clampRulers',
    'pointerGuidePoint', 'extendedRulerBounds', 'rulerHit', 'moveRuler', 'renderScanlineOverlay']) {
    vm.runInContext(sourceFunction(name), app);
  }
  app.event = (x, y) => ({ clientX: app.mainRect.left + x * app.mainRect.width / app.state.cageWidth,
    clientY: app.mainRect.top + y * app.mainRect.height / app.state.cageHeight });
  return app;
}

test('rulers occupy the same source pixel cells as artwork at 4000% zoom', () => {
  const app = editor(), t = context(); app.state.rulersV = [2]; app.state.rulersH = [3];
  app.drawTopRulers(t, app.overlayRect, app.mainRect);
  assert.deepEqual(t.rects, [[100, 20, 40, 200], [20, 140, 200, 40]]);
});

test('cage and ruler borders use identical edge pixel cells', () => {
  const app = editor(), cage = context(), rulers = context(); app.state.rulersV = [0, 6];
  app.drawTopCageGuide(cage, app.overlayRect, app.mainRect); app.drawTopRulers(rulers, app.overlayRect, app.mainRect);
  assert.deepEqual(cage.rects, [[60, 20, 160, 40], [60, 220, 160, 40], [20, 60, 40, 160], [220, 60, 40, 160]]);
  assert.equal(rulers.rects[0][0], 20); assert.equal(rulers.rects[1][0], 220);
});

test('fractional display metrics retain their exact sprite origin and scale', () => {
  const app = editor(); app.state.cageWidth = 150;
  const m = app.overlayGuideMetrics({ left: 10.1, top: 20.2 }, { left: 23.5, top: 29.6, width: 655.5, height: 30 });
  assert.equal(m.width, 655.5); assert.equal(m.zoomX, 4.37); assert.ok(Math.abs(m.x0 - 13.4) < 1e-12);
});

test('fractional zoom and display scaling produce crisp adjacent guide pixels without gaps', () => {
  const app = editor(); app.state.cageWidth = 150; app.state.cageHeight = 150;
  app.mainRect = { left: 93.65, top: 80.25, width: 655.5, height: 655.5 };
  for (const density of [1, 1.25, 1.5, 2]) {
    const t = context(density); app.state.rulersV = [75, 76]; app.drawTopRulers(t, app.overlayRect, app.mainRect);
    const first = t.rects[0], second = t.rects[t.rects.length / 2];
    assert.ok(Math.abs(first[0] + first[2] - second[0]) < 1e-10);
    t.rects.flat().forEach(value => assert.ok(Math.abs(value - Math.round(value)) < 1e-10));
  }
});

test('extended ruler dashes stay anchored to sprite pixels while panning', () => {
  const app = editor(), before = context(), after = context(); app.state.rulersBeyondCage = true; app.state.rulersV = [2];
  app.overlayRect.height = 800; app.drawTopRulers(before, app.overlayRect, app.mainRect);
  app.mainRect.top -= 40; app.drawTopRulers(after, app.overlayRect, app.mainRect);
  assert.deepEqual(before.rects, [[100, 20, 40, 200], [100, 420, 40, 200]]);
  assert.deepEqual(after.rects, [[100, -20, 40, 200], [100, 380, 40, 200], [100, 780, 40, 40]]);
});

test('the entire enlarged ruler stripe can be grabbed', () => {
  const app = editor(); app.state.rulersV = [2];
  for (const x of [2.05, 2.5, 2.95]) { const hit = app.rulerHit(app.event(x, 1)); assert.equal(hit.kind, 'v'); assert.equal(hit.index, 0); }
  assert.equal(app.rulerHit(app.event(3.3, 1)), null);
});

test('ruler dragging preserves the grab point and advances in whole source pixels', () => {
  const app = editor(); app.state.rulersV = [2]; const hit = app.rulerHit(app.event(2.8, 1));
  app.moveRuler(hit, { x: 2.8, y: 1 }); assert.equal(app.state.rulersV[0], 2);
  app.moveRuler(hit, { x: 3.2, y: 1 }); assert.equal(app.state.rulersV[0], 2);
  app.moveRuler(hit, { x: 3.8, y: 1 }); assert.equal(app.state.rulersV[0], 3);
  app.moveRuler(hit, { x: 4.8, y: 1 }); assert.equal(app.state.rulersV[0], 4);
});

test('horizontal dragging uses the same pixel snap and respects cage edges', () => {
  const app = editor(); app.state.rulersH = [6]; const hit = app.rulerHit(app.event(1, 5.7));
  app.moveRuler(hit, { x: 1, y: 5.7 }); assert.equal(app.state.rulersH[0], 5);
  app.moveRuler(hit, { x: 1, y: 4.7 }); assert.equal(app.state.rulersH[0], 4);
  app.moveRuler(hit, { x: 1, y: 20 }); assert.equal(app.state.rulersH[0], 5);
  app.moveRuler(hit, { x: 1, y: -20 }); assert.equal(app.state.rulersH[0], 0);
});

test('extended rulers retain negative integer positions', () => {
  const app = editor(); app.state.rulersBeyondCage = true; app.state.rulersV = [-3]; app.mainRect.left = 300.25;
  const hit = app.rulerHit(app.event(-2.2, 1)); assert.equal(hit.kind, 'v');
  app.moveRuler(hit, { x: -1.2, y: 1 }); assert.equal(app.state.rulersV[0], -2);
});

test('old cage-edge ruler coordinates normalize to the actual final pixel', () => {
  const app = editor(); app.state.rulersV = [6, -1, 2.7]; app.state.rulersH = [6]; app.clampRulers();
  assert.deepEqual(Array.from(app.state.rulersV), [5, 0, 3]); assert.deepEqual(Array.from(app.state.rulersH), [5]);
});

test('overlay sizing uses its content box and actual display density rather than the shell border', () => {
  const app = editor(), t = context(); app.state.showCageOverlay = false; app.state.rulersV = [2];
  const overlay = { style: {}, width: 0, height: 0, getContext: () => t,
    getBoundingClientRect: () => ({ left: 81.25, top: 41.5, width: 320, height: 320 }) };
  app.els.scanlineOverlay = overlay; app.renderScanlineOverlay();
  assert.equal(overlay.width, 400); assert.equal(overlay.height, 400); assert.equal(t.sx, 1.25);
  assert.equal(t.rects[0][0], 124); assert.equal(t.rects[0][2], 50);
});
