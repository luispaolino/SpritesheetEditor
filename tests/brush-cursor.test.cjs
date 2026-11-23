const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const html = fs.readFileSync(path.join(__dirname, '..', 'SpritesheetEditor.html'), 'utf8');
function editor() {
  const callbacks = new Map(); let id = 0;
  const app = {
    state: { cageWidth: 384, cageHeight: 384, animationBrushSize: 1, animationTool: 'pencil', brushX: 170, brushY: 245 },
    window: { innerWidth: 2434, innerHeight: 1884, devicePixelRatio: 2 },
    animationPaintShiftHeld: false, animationPaintLineAnchor: () => null, activeAnimationLayer: () => ({}),
    requestAnimationFrame(callback) { callbacks.set(++id, callback); return id; },
    cancelAnimationFrame(id) { callbacks.delete(id); },
    callbacks, els: {}, document: { body: {} }
  };
  vm.createContext(app);
  for (const name of ['cagePixelPoint', 'hardPencilRowInset', 'pencilCursorFootprint', 'renderPencilCursorFootprint',
    'brushCursorOverlayBounds', 'resizeBrushCursorOverlay', 'cancelBrushCursorPreview', 'queueBrushCursorFromEvent']) {
    const start = html.indexOf(`    function ${name}(`);
    assert.notEqual(start, -1, name);
    vm.runInContext(html.slice(start, html.indexOf('\n    function ', start + 1)), app);
  }
  return app;
}

function expectedCells(size, eraser, px, py, width, height) {
  const cells = new Set(), left = Math.floor(px + .5 - size / 2), top = Math.floor(py + .5 - size / 2);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (eraser && (x + .5 - size / 2) ** 2 + (y + .5 - size / 2) ** 2 > (size / 2) ** 2) continue;
    const sx = left + x, sy = top + y;
    if (sx >= 0 && sx < width && sy >= 0 && sy < height) cells.add(`${sx},${sy}`);
  }
  return cells;
}

test('cursor row spans preserve every pencil and eraser pixel for sizes 1–50 and clipped cage edges', () => {
  const app = editor(); app.state.cageWidth = app.state.cageHeight = 64;
  for (const tool of ['pencil', 'eraser']) for (let size = 1; size <= 50; size++) {
    for (const [x, y] of [[0, 0], [1, 20], [63, 63], [31, 30]]) {
      Object.assign(app.state, { animationTool: tool, animationBrushSize: size, brushX: x, brushY: y });
      const cells = new Set();
      for (const row of app.pencilCursorFootprint() || []) for (let px = row.left; px < row.right; px++) cells.add(`${px},${row.y}`);
      assert.deepEqual(cells, expectedCells(size, tool === 'eraser', x, y, 64, 64), `${tool} ${size} at ${x},${y}`);
    }
  }
});

test('row contours retain the exact outside edges without internal pixel borders', () => {
  const app = editor(); app.state.cageWidth = app.state.cageHeight = 64;
  const t = { save() {}, restore() {}, setLineDash() {}, beginPath() {}, stroke() {} };
  for (const tool of ['pencil', 'eraser']) for (let size = 1; size <= 50; size++) {
    Object.assign(app.state, { animationTool: tool, animationBrushSize: size, brushX: 3, brushY: 5 });
    const actual = new Set(), expected = new Set(), cells = expectedCells(size, tool === 'eraser', 3, 5, 64, 64);
    const edge = (x1, y1, x2, y2) => `${x1},${y1}:${x2},${y2}`;
    app.strokeScreenPixelSegment = (_t, x1, y1, x2, y2) => {
      if (y1 === y2) for (let x = x1; x < x2; x++) actual.add(edge(x, y1, x + 1, y2));
      else for (let y = y1; y < y2; y++) actual.add(edge(x1, y, x2, y + 1));
    };
    for (const cell of cells) {
      const [x, y] = cell.split(',').map(Number);
      if (!cells.has(`${x - 1},${y}`)) expected.add(edge(x, y, x, y + 1));
      if (!cells.has(`${x + 1},${y}`)) expected.add(edge(x + 1, y, x + 1, y + 1));
      if (!cells.has(`${x},${y - 1}`)) expected.add(edge(x, y, x + 1, y));
      if (!cells.has(`${x},${y + 1}`)) expected.add(edge(x, y + 1, x + 1, y + 1));
    }
    app.renderPencilCursorFootprint(t, { left: 0, top: 0 }, 1, 1);
    assert.deepEqual(actual, expected, `${tool} ${size}`);
  }
});

const shell = { left: 0, top: 0, right: 2434, bottom: 1800 };
const main = { left: 50, top: 40, width: 1228.8, height: 1228.8 };
const frame = { width: 384, height: 384 };
test('high-density one-pixel cursor allocates only its footprint and retains viewport coordinates', () => {
  const app = editor(), bounds = app.brushCursorOverlayBounds(shell, main, frame, 'pencil', false);
  assert.ok(bounds.width <= 11 && bounds.height <= 11);
  const transforms = [], clears = [], context = { setTransform(...args) { transforms.push(args); }, clearRect(...args) { clears.push(args); } };
  const overlay = { parentElement: app.document.body, width: 0, height: 0, style: {}, getContext: () => context };
  app.els.brushCursorOverlay = overlay;
  app.resizeBrushCursorOverlay(bounds);
  assert.equal(overlay.width, bounds.width * 2); assert.equal(overlay.height, bounds.height * 2);
  assert.equal(overlay.style.left, `${bounds.left}px`); assert.equal(overlay.style.top, `${bounds.top}px`);
  assert.deepEqual(transforms.at(-1), [2, 0, 0, 2, -bounds.left * 2, -bounds.top * 2]);
  assert.deepEqual(clears.at(-1), [0, 0, overlay.width, overlay.height]);
});

test('Shift-line bounds include the anchor and brush size while clipping to the visible cage', () => {
  const app = editor(); app.animationPaintShiftHeld = true; app.state.animationBrushSize = 50;
  app.animationPaintLineAnchor = () => ({ x: -100.5, y: 10.5 });
  const bounds = app.brushCursorOverlayBounds(shell, main, frame, 'pencil', false);
  assert.equal(bounds.left, main.left - 3); assert.equal(bounds.top, main.top - 3);
  assert.ok(bounds.left + bounds.width >= main.left + 195 * 3.2);
  assert.ok(bounds.top + bounds.height >= main.top + 270 * 3.2);
  app.state.dragging = true;
  assert.ok(app.brushCursorOverlayBounds(shell, main, frame, 'pencil', false).width < bounds.width);
});

test('round brush bounds retain the crosshair at small zoom and clip offscreen footprints', () => {
  const app = editor(); app.brushCursorGeometry = () => ({ cx: 1, cy: 1, rx: .5, ry: .5 });
  const bounds = app.brushCursorOverlayBounds(shell, { left: 100, top: 100, width: 96, height: 96 }, frame, 'mask', false);
  assert.ok(bounds.width >= 22 && bounds.height >= 22);
  assert.equal(app.brushCursorOverlayBounds(shell, { left: -200, top: -200, width: 96, height: 96 }, frame, 'mask', false), null);
});

test('hover bursts render only the latest event once per frame and cancellation prevents stale cursors', () => {
  const app = editor(), events = []; app.syncBrushCursorFromEvent = event => events.push(event);
  for (let i = 0; i < 300; i++) app.queueBrushCursorFromEvent({ x: i });
  assert.equal(app.callbacks.size, 1); assert.equal(events.length, 0);
  const [id, callback] = [...app.callbacks][0]; app.callbacks.delete(id); callback();
  assert.deepEqual(events, [{ x: 299 }]);
  app.queueBrushCursorFromEvent({ x: 400 }); app.cancelBrushCursorPreview();
  assert.equal(app.callbacks.size, 0); assert.equal(app.queueBrushCursorFromEvent.event, null);
});
