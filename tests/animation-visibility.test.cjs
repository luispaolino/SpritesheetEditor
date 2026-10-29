const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function editor() {
  const element = { addEventListener() {}, querySelectorAll() { return []; }, classList: { contains() { return false; } } };
  const context = {
    state: { frames: [{ id: 'frame-a' }, { id: 'frame-b' }], currentFrame: 0, imageName: 'Imported sheet' },
    $() { return element; }, document: { addEventListener() {} },
    sheetBaseName(name) { return name; },
    pause() {}, pushHistory() {}, markFrameBitmapsDirty() {}, buildFilmstrip() {}, drawFrame() {}, updateInfo() {},
    makeMask() { return { getContext() { return {}; } }; }, drawBaseSprite() {},
    clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }, renderBrushCursorOverlay() {}
  };
  context.hasFrames = () => context.state.frames.length > 0;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'animation.js'), 'utf8'), context);
  return context;
}

test('hiding an imported spritesheet frame leaves neighboring frames visible', () => {
  const app = editor();
  app.toggleAnimationVisibility('animation-base');
  const base = app.animationLayerList()[0];
  assert.equal(app.animationLayerVisible(base, 0), false);
  assert.equal(app.animationLayerVisible(base, 1), true);
  assert.equal(base.visible, true);
  assert.equal(app.state.frames[1].animationVisibility, undefined);
});

test('showing a frame again does not change a separately hidden frame', () => {
  const app = editor();
  app.toggleAnimationVisibility('animation-base');
  app.state.currentFrame = 1;
  app.toggleAnimationVisibility('animation-base');
  app.state.currentFrame = 0;
  app.toggleAnimationVisibility('animation-base');
  const base = app.animationLayerList()[0];
  assert.equal(app.animationLayerVisible(base, 0), true);
  assert.equal(app.animationLayerVisible(base, 1), false);
});

test('hiding one part leaves other parts and frames visible', () => {
  const app = editor();
  app.state.animationLayers = [
    { id: 'arm', name: 'Arm', visible: true },
    { id: 'animation-base', name: 'Body', base: true, visible: true }
  ];
  app.toggleAnimationVisibility('arm');
  assert.equal(app.animationLayerVisible(app.state.animationLayers[0], 0), false);
  assert.equal(app.animationLayerVisible(app.state.animationLayers[0], 1), true);
  assert.equal(app.animationLayerVisible(app.state.animationLayers[1], 0), true);
});

test('the renderer uses the frame being rendered rather than the current frame', () => {
  const app = editor();
  app.toggleAnimationVisibility('animation-base');
  const rendered = [];
  app.drawBaseSprite = (_context, index) => rendered.push(index);
  const target = { save() {}, beginPath() {}, rect() {}, clip() {}, drawImage() {}, restore() {} };
  app.drawAnimationSprite(target, 0, 0, 0, {});
  app.drawAnimationSprite(target, 1, 0, 0, {});
  assert.deepEqual(rendered, [1]);
});

test('visibility copies are independent for history and duplicated frames', () => {
  const app = editor();
  const source = { 'animation-base': false, arm: true };
  const history = app.cloneAnimationVisibility(source);
  const duplicate = app.cloneAnimationVisibility(source);
  duplicate['animation-base'] = true;
  source.arm = false;
  assert.equal(history['animation-base'], false);
  assert.equal(history.arm, true);
  assert.equal(duplicate.arm, true);
});

test('visibility follows its frame when the timeline is reordered', () => {
  const app = editor();
  app.toggleAnimationVisibility('animation-base');
  app.state.frames.reverse();
  const base = app.animationLayerList()[0];
  assert.equal(app.state.frames[1].id, 'frame-a');
  assert.equal(app.animationLayerVisible(base, 0), true);
  assert.equal(app.animationLayerVisible(base, 1), false);
});

test('older project visibility remains the default until overridden in a frame', () => {
  const app = editor();
  app.state.animationLayers = [{ id: 'animation-base', name: 'Sprite', visible: false, base: true }];
  app.toggleAnimationVisibility('animation-base');
  const base = app.animationLayerList()[0];
  assert.equal(app.animationLayerVisible(base, 0), true);
  assert.equal(app.animationLayerVisible(base, 1), false);
});

test('rectangle selection covers exact pixels in either drag direction', () => {
  const app = editor();
  const forward = app.rasterizeAnimationSelection({ kind: 'rectangle', points: [{ x: 1, y: 1 }, { x: 4, y: 3 }] }, 5, 5);
  const backward = app.rasterizeAnimationSelection({ kind: 'rectangle', points: [{ x: 4, y: 3 }, { x: 1, y: 1 }] }, 5, 5);
  assert.deepEqual(Array.from(forward), Array.from(backward));
  assert.equal(Array.from(forward).filter(alpha => alpha === 255).length, 6);
  assert.equal(forward[1 * 5 + 1], 255);
  assert.equal(forward[3 * 5 + 4], 0);
});

test('diagonal lasso selection has binary edges without anti-aliasing', () => {
  const app = editor();
  const mask = app.rasterizeAnimationSelection({ kind: 'lasso', points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 4 }] }, 4, 4);
  assert.deepEqual(Array.from(mask), [255,255,255,0, 255,255,0,0, 255,0,0,0, 0,0,0,0]);
  assert.ok(Array.from(mask).every(alpha => alpha === 0 || alpha === 255));
});

test('selection clips to canvas bounds and degenerate lassos select nothing', () => {
  const app = editor();
  const mask = app.rasterizeAnimationSelection({ kind: 'rectangle', points: [{ x: -3, y: -2 }, { x: 2, y: 2 }] }, 3, 3);
  assert.deepEqual(Array.from(mask), [255,255,0, 255,255,0, 0,0,0]);
  const empty = app.rasterizeAnimationSelection({ kind: 'lasso', points: [{ x: 0, y: 0 }, { x: 2, y: 2 }] }, 3, 3);
  assert.ok(Array.from(empty).every(alpha => alpha === 0));
});

function wheelEditor(tool, animationActive = true) {
  const app = editor();
  Object.assign(app.state, { animationTool: tool, animationBrushSize: 14, brushSize: 30, zoom: 3, panX: 0, panY: 0 });
  Object.assign(app, {
    animationPanelActive: () => animationActive,
    eventInsideReferenceCompositor: () => false, canvasContentAvailable: () => true,
    spriteSheetBuilderToolSurfaceAvailable: () => false,
    canvasZoomMin: () => .1, CANVAS_ZOOM_MAX: 20, updateCanvasZoom() {},
    els: {
      brushSizeInput: {},
      canvasShell: { addEventListener(_type, handler) { app.wheel = handler; } },
      mainCanvas: { getBoundingClientRect() { return { left: 0, top: 0, width: 300, height: 300 }; } }
    }
  });
  const html = fs.readFileSync(path.join(__dirname, '..', 'SpritesheetEditor.html'), 'utf8');
  const start = html.indexOf('    function adjustBrushSize(');
  vm.runInContext(html.slice(start, html.indexOf('    function oneRowPackLayout(', start)), app);
  vm.runInContext(html.split('\n').find(line => line.includes("els.canvasShell.addEventListener('wheel',")), app);
  app.scroll = (deltaY, shiftKey = true) => app.wheel({ deltaY, shiftKey, clientX: 150, clientY: 150, preventDefault() {} });
  return app;
}

test('Shift + Wheel sizes either Animation brush without zooming or changing Edit Tools size', () => {
  for (const tool of ['pencil', 'eraser']) {
    const app = wheelEditor(tool);
    app.scroll(-200);
    assert.equal(app.state.animationBrushSize, 16);
    app.scroll(100);
    assert.equal(app.state.animationBrushSize, 15);
    assert.equal(app.state.brushSize, 30);
    assert.equal(app.state.zoom, 3);
    app.state.animationBrushSize = 120; app.scroll(-100);
    assert.equal(app.state.animationBrushSize, 120);
    app.state.animationBrushSize = 1; app.scroll(100);
    assert.equal(app.state.animationBrushSize, 1);
  }
});

test('Edit Tools sizing and normal canvas zoom keep their existing behavior', () => {
  const edit = wheelEditor('pencil', false);
  edit.state.pencilMode = true;
  edit.scroll(-100);
  assert.equal(edit.state.brushSize, 31);
  assert.equal(edit.state.animationBrushSize, 14);
  assert.equal(edit.state.zoom, 3);
  for (const tool of ['pencil', 'rectangle']) {
    const app = wheelEditor(tool);
    app.scroll(-100, tool === 'rectangle');
    assert.equal(app.state.animationBrushSize, 14);
    assert.equal(app.state.zoom, 3 * 1.12);
  }
});
