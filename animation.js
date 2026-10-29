// Animation layers use the existing frame timeline. Cels belong to frame records,
// so timeline duplication, deletion, and reordering keep artwork with its frame.
const ANIMATION_BASE_ID = 'animation-base';
const animationEls = {
  group: $('animationGroup'), input: $('animationFileInput'), drop: $('animationDropZone'),
  list: $('animationLayerList'), split: $('animationSplitButton'), colors: $('animationColorStrip'),
  size: $('animationBrushSizeInput'), sizeValue: $('animationBrushSizeValue'), sizeField: $('animationBrushSizeField'),
  selectionActions: $('animationSelectionActions')
};
let animationSelection = null;
let animationStroke = null;
let animationLayerDrag = null;
let animationInputHistory = null;
let animationSelectionRasterCache = null;
let animationSelectionOverlay = null;
let animationSelectionAnimationId = null;
let animationSelectionLastPaint = 0;

function animationPanelActive() {
  return animationEls.group.classList.contains('inspector-active') && !state.referenceCompositorVisible;
}
function animationPixelBrushActive() {
  return animationPanelActive() && ['pencil','eraser'].includes(state.animationTool);
}
function setAnimationBrushSize(value) {
  state.animationBrushSize = clamp(Math.round(Number(value) || 1),1,120);
  animationEls.size.value = state.animationBrushSize;
  animationEls.sizeValue.textContent = state.animationBrushSize;
  renderBrushCursorOverlay();
}
function animationLayerList() {
  return Array.isArray(state.animationLayers) ? state.animationLayers
    : (hasFrames() ? [{ id: ANIMATION_BASE_ID, name: sheetBaseName(state.imageName) || 'Sprite', visible: true, base: true }] : []);
}
function ensureAnimationLayers() {
  if (!Array.isArray(state.animationLayers)) state.animationLayers = animationLayerList().map(layer => ({ ...layer }));
  return state.animationLayers;
}
function activeAnimationLayer() {
  const layers = animationLayerList();
  return layers.find(layer => layer.id === state.activeAnimationLayerId) || layers[0] || null;
}
function cloneAnimationLayers(layers) {
  return Array.isArray(layers) ? layers.map(layer => ({ id: String(layer.id), name: String(layer.name || 'Sprite'), visible: layer.visible !== false, base: layer.id === ANIMATION_BASE_ID })) : null;
}
function cloneAnimationVisibility(visibility = {}) {
  return Object.fromEntries(Object.entries(visibility || {}).filter(([,visible]) => typeof visible === 'boolean'));
}
function animationLayerVisible(layer, i = state.currentFrame) {
  if (!layer) return false;
  const visible = state.frames[i]?.animationVisibility?.[layer.id];
  return typeof visible === 'boolean' ? visible : layer.visible !== false;
}
function toggleAnimationVisibility(id) {
  const layer = animationLayerList().find(layer => layer.id === id), frame = state.frames[state.currentFrame];
  if (!layer || !frame) return;
  pause();
  const visible = animationLayerVisible(layer);
  pushHistory();
  ensureAnimationLayers();
  frame.animationVisibility = { ...cloneAnimationVisibility(frame.animationVisibility), [id]: !visible };
  animationChanged();
}
function cloneAnimationCels(cels = {}) {
  return Object.fromEntries(Object.entries(cels || {}).filter(([,cel]) => cel?.canvas).map(([id,cel]) => [id, {
    canvas: canvasClone(cel.canvas), offsetX: Math.round(cel.offsetX || 0), offsetY: Math.round(cel.offsetY || 0), flipX: !!cel.flipX, flipY: !!cel.flipY
  }]));
}
function serializeAnimationCels(cels = {}) {
  return Object.fromEntries(Object.entries(cels || {}).filter(([,cel]) => cel?.canvas).map(([id,cel]) => [id, {
    data: cel.canvas.toDataURL('image/png'), offsetX: Math.round(cel.offsetX || 0), offsetY: Math.round(cel.offsetY || 0), flipX: !!cel.flipX, flipY: !!cel.flipY
  }]));
}
async function restoreAnimationCels(cels = {}) {
  const restored = {};
  for (const [id,cel] of Object.entries(cels || {})) {
    if (!cel?.data) continue;
    restored[id] = { canvas: await canvasFromDataURL(cel.data), offsetX: Math.round(cel.offsetX || 0), offsetY: Math.round(cel.offsetY || 0), flipX: !!cel.flipX, flipY: !!cel.flipY };
  }
  return restored;
}
function resetAnimationTools() {
  state.animationTool = 'move';
  animationSelection = null;
  animationStroke = null;
  animationInputHistory = null;
  animationSelectionRasterCache = null;
  hideAnimationSelectionOverlay();
}
function resetAnimationState() {
  state.animationLayers = null;
  state.activeAnimationLayerId = '';
  state.animationBrushSize = 1;
  resetAnimationTools();
}
function animationCel(layer, i = state.currentFrame) {
  if (!layer) return null;
  if (layer.base) {
    const frame = state.frames[i];
    if (!frame) return null;
    const offset = state.frameOffsets[i] || { x: 0, y: 0 };
    return { canvas: frame.canvas, offsetX: offset.x, offsetY: offset.y, flipX: frameFlipX(i), flipY: frameFlipY(i) };
  }
  return state.frames[i]?.animationCels?.[layer.id] || null;
}
function animationCelPosition(cel) {
  return { x: Math.round((state.cageWidth - cel.canvas.width) / 2) + Math.round(cel.offsetX || 0), y: Math.round((state.cageHeight - cel.canvas.height) / 2) + Math.round(cel.offsetY || 0) };
}
function drawAnimationCel(t, cel, x = 0, y = 0) {
  if (!cel?.canvas) return;
  const p = animationCelPosition(cel), w = cel.canvas.width, h = cel.canvas.height;
  t.save();
  t.imageSmoothingEnabled = false;
  t.translate(x + p.x + (cel.flipX ? w : 0), y + p.y + (cel.flipY ? h : 0));
  t.scale(cel.flipX ? -1 : 1, cel.flipY ? -1 : 1);
  t.drawImage(cel.canvas, 0, 0);
  t.restore();
}
function drawAnimationSprite(t, i, x, y, opt) {
  if (!Array.isArray(state.animationLayers)) return false;
  t.save(); t.beginPath(); t.rect(x, y, state.cageWidth, state.cageHeight); t.clip();
  for (const layer of [...state.animationLayers].reverse()) {
    if (!animationLayerVisible(layer, i)) continue;
    if (layer.base) {
      // Base masks and blend modes must not erase or recolor lower sprite layers.
      const base = makeMask();
      drawBaseSprite(base.getContext('2d'), i, 0, 0, opt);
      t.drawImage(base, x, y);
    } else drawAnimationCel(t, animationCel(layer, i), x, y);
  }
  t.restore();
  return true;
}
function validAnimationSelection() {
  return animationSelection && animationSelection.frameId === state.frames[state.currentFrame]?.id
    && animationSelection.layerId === activeAnimationLayer()?.id;
}
function rasterizeAnimationSelection(selection, width, height) {
  const alpha = new Uint8Array(width * height), points = selection?.points || [];
  if (points.length < 2) return alpha;
  if (selection.kind === 'rectangle') {
    const a = points[0], b = points[points.length - 1];
    const left = Math.max(0, Math.min(width, Math.min(a.x,b.x)));
    const right = Math.max(0, Math.min(width, Math.max(a.x,b.x)));
    const top = Math.max(0, Math.min(height, Math.min(a.y,b.y)));
    const bottom = Math.max(0, Math.min(height, Math.max(a.y,b.y)));
    for (let y = Math.ceil(top - .5); y < Math.ceil(bottom - .5); y++) {
      alpha.fill(255, y * width + Math.ceil(left - .5), y * width + Math.ceil(right - .5));
    }
  } else {
    // Scan pixel centers directly: the mask never contains feathered edge pixels.
    if (points.length < 3) return alpha;
    let minY = height, maxY = 0;
    for (const point of points) { minY = Math.min(minY,point.y); maxY = Math.max(maxY,point.y); }
    const top = Math.max(0, Math.floor(minY));
    const bottom = Math.min(height, Math.ceil(maxY));
    for (let y = top; y < bottom; y++) {
      const scanY = y + .5, intersections = [];
      for (let i = 0, previous = points.length - 1; i < points.length; previous = i++) {
        const a = points[previous], b = points[i];
        if ((a.y > scanY) !== (b.y > scanY)) intersections.push(a.x + (scanY - a.y) * (b.x - a.x) / (b.y - a.y));
      }
      intersections.sort((a,b) => a-b);
      for (let i = 0; i + 1 < intersections.length; i += 2) {
        const left = Math.max(0, Math.min(width, Math.ceil(intersections[i] - .5)));
        const right = Math.max(0, Math.min(width, Math.ceil(intersections[i+1] - .5)));
        alpha.fill(255, y * width + left, y * width + right);
      }
    }
  }
  return alpha;
}
function animationSelectionRaster() {
  if (!validAnimationSelection()) return null;
  const width = state.cageWidth, height = state.cageHeight;
  const key = JSON.stringify([width,height,animationSelection.kind,animationSelection.points]);
  if (animationSelectionRasterCache?.key === key) return animationSelectionRasterCache;
  const alpha = rasterizeAnimationSelection(animationSelection,width,height), mask = makeMask(), fill = makeMask();
  const mc = mask.getContext('2d'), fc = fill.getContext('2d'), maskImage = mc.createImageData(width,height), fillImage = fc.createImageData(width,height), edges = [];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const index = y * width + x;
    if (!alpha[index]) continue;
    const pixel = index * 4;
    maskImage.data[pixel] = maskImage.data[pixel+1] = maskImage.data[pixel+2] = maskImage.data[pixel+3] = 255;
    fillImage.data[pixel] = 112; fillImage.data[pixel+1] = 205; fillImage.data[pixel+2] = 248; fillImage.data[pixel+3] = 31;
    if (!y || !alpha[index-width]) edges.push([x,y,x+1,y]);
    if (y === height-1 || !alpha[index+width]) edges.push([x,y+1,x+1,y+1]);
    if (!x || !alpha[index-1]) edges.push([x,y,x,y+1]);
    if (x === width-1 || !alpha[index+1]) edges.push([x+1,y,x+1,y+1]);
  }
  mc.putImageData(maskImage,0,0); fc.putImageData(fillImage,0,0);
  animationSelectionRasterCache = {key,mask,fill,edges};
  return animationSelectionRasterCache;
}
function hideAnimationSelectionOverlay() {
  if (animationSelectionOverlay) animationSelectionOverlay.style.display = 'none';
  if (animationSelectionAnimationId !== null) cancelAnimationFrame(animationSelectionAnimationId);
  animationSelectionAnimationId = null;
  animationSelectionLastPaint = 0;
}
function queueAnimationSelectionOverlay() {
  if (animationSelectionAnimationId === null) {
    animationSelectionAnimationId = requestAnimationFrame(() => { animationSelectionAnimationId = null; renderAnimationSelectionOverlay(false); });
  }
}
function renderAnimationSelectionOverlay(force = true) {
  if (!animationPanelActive() || !validAnimationSelection()) { hideAnimationSelectionOverlay(); return; }
  // Keep the ants moving while idle without repainting the whole editor at 60 FPS.
  if (!force && performance.now() - animationSelectionLastPaint < 80) { queueAnimationSelectionOverlay(); return; }
  const raster = animationSelectionRaster();
  if (!raster) { hideAnimationSelectionOverlay(); return; }
  if (!animationSelectionOverlay) {
    animationSelectionOverlay = document.createElement('canvas');
    animationSelectionOverlay.id = 'animationSelectionOverlay';
    animationSelectionOverlay.className = 'animation-selection-overlay';
    animationSelectionOverlay.setAttribute('aria-hidden','true');
    els.canvasShell.appendChild(animationSelectionOverlay);
  }
  const ratio = Math.max(1,window.devicePixelRatio || 1), canvas = animationSelectionOverlay;
  canvas.style.display = 'block';
  const overlay = canvas.getBoundingClientRect(), main = els.mainCanvas.getBoundingClientRect();
  const width = Math.max(1,Math.round(overlay.width * ratio)), height = Math.max(1,Math.round(overlay.height * ratio));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const t = canvas.getContext('2d'), offsetX = (main.left-overlay.left)*ratio, offsetY = (main.top-overlay.top)*ratio;
  const sx = main.width * ratio / state.cageWidth, sy = main.height * ratio / state.cageHeight;
  t.clearRect(0,0,width,height); t.imageSmoothingEnabled = false;
  t.drawImage(raster.fill,Math.round(offsetX),Math.round(offsetY),Math.round(main.width*ratio),Math.round(main.height*ratio));
  const stripe = Math.max(1,Math.round(4*ratio)), size = stripe*2;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const phase = reducedMotion ? 0 : Math.floor(performance.now()/80) % size;
  const tile = makeMask(size,size), tileContext = tile.getContext('2d'), image = tileContext.createImageData(size,size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const p = (y*size+x)*4, color = (x+y+phase)%size < stripe ? 0 : 255;
    image.data[p] = image.data[p+1] = image.data[p+2] = color; image.data[p+3] = 255;
  }
  tileContext.putImageData(image,0,0); t.fillStyle = t.createPattern(tile,'repeat');
  const thickness = Math.max(1,Math.round(ratio));
  for (const [x1,y1,x2,y2] of raster.edges) {
    const left = Math.round(offsetX+x1*sx), top = Math.round(offsetY+y1*sy);
    if (x1 === x2) t.fillRect(left,top,thickness,Math.max(1,Math.round(offsetY+y2*sy)-top));
    else t.fillRect(left,top,Math.max(1,Math.round(offsetX+x2*sx)-left),thickness);
  }
  canvas.dataset.phase = String(phase);
  animationSelectionLastPaint = performance.now();
  if (!reducedMotion) queueAnimationSelectionOverlay();
}
function animationChanged(rebuild = true) {
  markFrameBitmapsDirty();
  if (rebuild) buildFilmstrip();
  drawFrame(state.currentFrame);
  updateInfo();
}
function selectAnimationLayer(id) {
  if (!animationLayerList().some(layer => layer.id === id)) return;
  state.activeAnimationLayerId = id;
  animationSelection = null;
  drawFrame(state.currentFrame); updateAnimationUi();
}
function setAnimationOffset(id, axis, value, history = true) {
  const layer = animationLayerList().find(layer => layer.id === id), cel = animationCel(layer);
  if (!cel) return;
  const next = Math.round(Number(value) || 0), key = axis === 'x' ? 'offsetX' : 'offsetY';
  if (cel[key] === next) return;
  if (history) pushHistory();
  if (layer.base) state.frameOffsets[state.currentFrame][axis] = next;
  else cel[key] = next;
  state.activeAnimationLayerId = id;
  animationSelection = null;
  animationChanged(false);
}
function toggleAnimationFlip(id, axis) {
  const layer = animationLayerList().find(layer => layer.id === id), cel = animationCel(layer);
  if (!cel) return;
  pushHistory();
  if (layer.base) {
    const flips = axis === 'x' ? state.frameFlips : state.frameFlipYs;
    flips[state.currentFrame] = !flips[state.currentFrame];
  } else cel[axis === 'x' ? 'flipX' : 'flipY'] = !cel[axis === 'x' ? 'flipX' : 'flipY'];
  state.activeAnimationLayerId = id; animationSelection = null; animationChanged();
}
function removeAnimationLayer(id) {
  if (!animationLayerList().some(layer => layer.id === id)) return;
  pushHistory();
  const layers = ensureAnimationLayers(), at = layers.findIndex(layer => layer.id === id);
  layers.splice(at,1);
  state.frames.forEach(frame => {
    if (frame.animationCels) delete frame.animationCels[id];
    if (frame.animationVisibility) delete frame.animationVisibility[id];
  });
  state.activeAnimationLayerId = layers[Math.min(at,layers.length-1)]?.id || '';
  animationSelection = null; animationChanged();
}
function renameAnimationLayer(id, name) {
  const layer = animationLayerList().find(layer => layer.id === id), next = name.trim();
  if (!layer || !next || next === layer.name) { updateAnimationUi(true); return; }
  pushHistory();
  ensureAnimationLayers().find(item => item.id === id).name = next;
  updateAnimationUi(true);
}
function moveAnimationLayer(id, targetId, after) {
  const layers = animationLayerList(), from = layers.findIndex(layer => layer.id === id);
  if (from < 0 || id === targetId || !layers.some(layer => layer.id === targetId)) return;
  const next = layers.filter(layer => layer.id !== id), index = next.findIndex(layer => layer.id === targetId) + (after ? 1 : 0);
  next.splice(index,0,layers[from]);
  if (next.every((layer,i) => layer.id === layers[i].id)) return;
  pushHistory(); state.animationLayers = next; state.activeAnimationLayerId = id; animationChanged();
}
function updateAnimationUi(force = false) {
  const layers = animationLayerList(), active = activeAnimationLayer();
  if (!validAnimationSelection()) animationSelection = null;
  const selected = !!animationSelection;
  animationEls.split.disabled = !selected || !animationLayerVisible(active);
  animationEls.selectionActions.hidden = !selected;
  const tool = state.animationTool || 'move';
  animationEls.group.querySelectorAll('[data-animation-tool]').forEach(button => {
    const on = button.dataset.animationTool === tool;
    button.classList.toggle('active',on); button.setAttribute('aria-pressed',String(on));
    button.disabled = !hasFrames() || (!active && button.dataset.animationTool !== 'dropper');
  });
  animationEls.sizeField.hidden = !['pencil','eraser'].includes(tool);
  animationEls.size.value = state.animationBrushSize || 1;
  animationEls.sizeValue.textContent = state.animationBrushSize || 1;
  // Update controls in place while typing or scrubbing their numeric values.
  const signature = JSON.stringify(layers.map(layer => [layer.id,layer.name,layer.visible]));
  const list = animationEls.list;
  if (force || list.dataset.layerKey !== signature) {
    list.dataset.layerKey = signature; list.replaceChildren();
    layers.forEach(layer => {
      const item = document.createElement('div'); item.className = 'reference-layer-item animation-layer-item'; item.dataset.animationId = layer.id;
      const actions = document.createElement('div'); actions.className = 'animation-layer-actions';
      const name = document.createElement('button'); name.type = 'button'; name.className = 'reference-layer-name animation-layer-name secondary'; name.textContent = layer.name; name.title = 'Drag to reorder; double-click to rename';
      name.setAttribute('aria-label', `Select ${layer.name}`);
      const eye = document.createElement('button'); eye.type = 'button'; eye.className = 'lock-button reference-visibility-button'; eye.dataset.animationAction = 'visible';
      eye.innerHTML = '<svg class="lock-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'lock-button reference-remove-button'; remove.dataset.animationAction = 'remove'; remove.setAttribute('aria-label',`Remove ${layer.name}`); remove.title = 'Remove Layer';
      remove.innerHTML = '<svg class="lock-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"></path></svg>';
      actions.append(eye,remove);
      const controls = document.createElement('div'); controls.className = 'reference-layer-controls animation-layer-controls';
      const flips = document.createElement('div'); flips.className = 'animation-layer-flips';
      ['x','y'].forEach(axis => {
        const label = document.createElement('label'); label.className = 'animation-offset-field'; label.append(axis.toUpperCase());
        const input = document.createElement('input'); input.type = 'number'; input.step = '1'; input.className = 'reference-offset-input'; input.dataset.animationOffset = axis; input.setAttribute('aria-label',`Offset ${axis.toUpperCase()} for ${layer.name}`);
        label.append(input); controls.append(label);
      });
      ['x','y'].forEach(axis => {
        const flip = document.createElement('button'); flip.type = 'button'; flip.className = 'secondary reference-flip-button'; flip.dataset.animationFlip = axis;
        const label = axis === 'x' ? 'Flip horizontal' : 'Flip vertical'; flip.title = label; flip.setAttribute('aria-label',`${label} for ${layer.name}`);
        const icon = document.createElement('img'); icon.className = 'tool-icon-image'; icon.alt = ''; icon.src = `icons/flip-${axis === 'x' ? 'horizontal' : 'vertical'}.svg`; flip.append(icon); flips.append(flip);
      });
      item.append(actions,name,controls,flips); list.append(item);
    });
  }
  layers.forEach(layer => {
    const item = [...list.children].find(el => el.dataset.animationId === layer.id); if (!item) return;
    const cel = animationCel(layer); item.classList.toggle('active',layer.id === active?.id);
    const visible = animationLayerVisible(layer);
    const eye = item.querySelector('[data-animation-action="visible"]'); eye.classList.toggle('active',visible); eye.setAttribute('aria-pressed',String(visible)); eye.setAttribute('aria-label',`${visible ? 'Hide' : 'Show'} ${layer.name}`); eye.title = `${visible ? 'Hide' : 'Show'} sprite in current frame`;
    item.querySelectorAll('[data-animation-offset]').forEach(input => { if (document.activeElement !== input) input.value = Math.round(cel?.[input.dataset.animationOffset === 'x' ? 'offsetX' : 'offsetY'] || 0); input.disabled = !cel; });
    item.querySelectorAll('[data-animation-flip]').forEach(button => { const flip = !!cel?.[button.dataset.animationFlip === 'x' ? 'flipX' : 'flipY']; button.classList.toggle('active',flip); button.setAttribute('aria-pressed',String(flip)); button.disabled = !cel; });
  });
  const colorKey = JSON.stringify([state.pencilColors,state.activePencilColorIndex]);
  if (animationEls.colors.dataset.colorKey !== colorKey) {
    animationEls.colors.dataset.colorKey = colorKey; animationEls.colors.replaceChildren();
    (state.pencilColors || [state.pencilColor]).forEach((color,index) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'swatch-button pencil-color-button'; button.dataset.animationColor = index; button.setAttribute('aria-label',`Animation pencil color ${index+1}`); button.classList.toggle('active',index === state.activePencilColorIndex); button.setAttribute('aria-pressed',String(index === state.activePencilColorIndex));
      const chip = document.createElement('span'); chip.className = 'swatch-chip'; const background = pencilColorSwatchBackground(color); chip.style.backgroundImage = background.image; chip.style.backgroundSize = background.size; chip.style.backgroundPosition = background.position; button.append(chip); animationEls.colors.append(button);
    });
  }
}
async function loadAnimationSprites(files) {
  const accepted = displayReferenceFileList(files); if (!accepted.length) return;
  try {
    showError('');
    // Decode before committing, so an invalid file leaves the current project intact.
    const sprites = [];
    for (const file of accepted) sprites.push(await createDisplayReferenceLayerFromFile(file,{ id: `animation-${Date.now()}-${Math.random().toString(36).slice(2)}` }));
    pause(true); pushHistory();
    for (const sprite of sprites) {
      const sources = sprite.frames.length ? sprite.frames.map(f => f.canvas) : [sprite.canvas];
      if (!hasFrames()) {
        state.frames = sources.map((canvas,i) => ({ kind:'image', id:`image-${Date.now()}-${state.importedId++}`, name:`${sprite.name} ${i+1}`, canvas:canvasClone(canvas), sourceCanvas:canvasClone(canvas) }));
        state.imageName = sprite.name; state.sheetImage = null; state.sheetImages = [];
        state.frameOffsets = []; state.frameMasks = []; state.maskDirty = []; state.indexedFrames = []; state.frameScales = []; state.frameFlips = []; state.frameFlipYs = [];
        state.scaleX = 1; state.scaleY = 1; state.offsetXAll = 0; state.offsetYAll = 0;
        state.cageCustom = false; state.currentFrame = 0; state.selectedFrameIndices = [0]; state.selectionAnchorFrame = 0;
        state.animationLayers = [{ id:ANIMATION_BASE_ID, name:sprite.name, visible:true, base:true }];
        state.activeAnimationLayerId = ANIMATION_BASE_ID;
        autoFitGridToFrameCount(); updateMetrics();
        state.pivotX = defaultPivotX(); state.pivotY = state.cageHeight;
      } else {
        const layers = ensureAnimationLayers();
        while (state.frames.length < sources.length) {
          const at = state.frames.length-1;
          state.frames.push(cloneFrameRecord(state.frames[at]));
          state.frameOffsets.push({ ...(state.frameOffsets[at] || {x:0,y:0}) });
          state.frameMasks.push(canvasClone(state.frameMasks[at] || makeMask())); state.maskDirty.push(!!state.maskDirty[at]);
          state.indexedFrames.push(null); state.frameScales.push({ ...frameScaleMultiplier(at) }); state.frameFlips.push(frameFlipX(at)); state.frameFlipYs.push(frameFlipY(at));
        }
        const id = sprite.id; layers.unshift({ id,name:sprite.name,visible:true,base:false });
        state.frames.forEach((frame,i) => {
          frame.animationCels ||= {};
          frame.animationCels[id] = { canvas:canvasClone(sources[i % sources.length]),offsetX:0,offsetY:0,flipX:false,flipY:false };
        });
        state.activeAnimationLayerId = id;
      }
    }
    resetAnimationTools(); syncAfterDataChange(true);
  } catch (error) { showError(error.message || 'Could not load that sprite.'); }
  finally { animationEls.input.value = ''; }
}
function animationSelectionMask() {
  return animationSelectionRaster()?.mask || null;
}
function animationBakeBase(i) {
  const frame = state.frames[i], canvas = makeMask(), t = canvas.getContext('2d');
  drawBaseSprite(t,i,0,0,{applyMask:true});
  frame.canvas = canvas; frame.sourceCanvas = canvasClone(canvas); frame.pencilLayers = []; frame.sheetSlice = null; frame.sheetCrop = null;
  state.frameOffsets[i] = {x:0,y:0};
  const scale = allFrameScale(); state.frameScales[i] = {x:1/scale.x,y:1/scale.y}; state.frameFlips[i] = false; state.frameFlipYs[i] = false;
  state.frameMasks[i] = makeMask(); state.maskDirty[i] = false; state.indexedFrames[i] = null;
  return canvas;
}
function animationLocalMask(mask, cel) {
  const local = makeMask(cel.canvas.width,cel.canvas.height), t = local.getContext('2d'), p = animationCelPosition(cel);
  t.imageSmoothingEnabled = false;
  t.translate(cel.flipX ? cel.canvas.width : 0,cel.flipY ? cel.canvas.height : 0); t.scale(cel.flipX ? -1 : 1,cel.flipY ? -1 : 1); t.drawImage(mask,-p.x,-p.y);
  return local;
}
function animationBakeCel(layer, i) {
  const cel = animationCel(layer, i), canvas = makeMask();
  drawAnimationCel(canvas.getContext('2d'), cel);
  cel.canvas = canvas; cel.offsetX = 0; cel.offsetY = 0; cel.flipX = false; cel.flipY = false;
}
function splitAnimationSelection() {
  const layer = activeAnimationLayer(), mask = animationSelectionMask();
  if (!animationLayerVisible(layer) || !mask || !animationCel(layer)) return;
  const source = makeMask(), t = source.getContext('2d');
  if (layer.base) drawBaseSprite(t,state.currentFrame,0,0,{applyMask:true});
  else drawAnimationCel(t,animationCel(layer));
  t.globalCompositeOperation = 'destination-in'; t.drawImage(mask,0,0); t.globalCompositeOperation = 'source-over';
  const pixels = t.getImageData(0,0,source.width,source.height); let left=source.width,top=source.height,right=-1,bottom=-1;
  for (let y=0;y<source.height;y++) for (let x=0;x<source.width;x++) if(pixels.data[(y*source.width+x)*4+3]) {left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
  if (right < left) { showError('Select some visible pixels on the active sprite before splitting.'); return; }
  pushHistory();
  const target = layer.base ? {canvas:animationBakeBase(state.currentFrame),offsetX:0,offsetY:0,flipX:false,flipY:false} : animationCel(layer);
  const cut = layer.base ? mask : animationLocalMask(mask,target), targetContext = target.canvas.getContext('2d');
  targetContext.save(); targetContext.globalCompositeOperation='destination-out'; targetContext.drawImage(cut,0,0); targetContext.restore();
  if(layer.base) state.frames[state.currentFrame].sourceCanvas = canvasClone(target.canvas);
  const cropped = makeMask(right-left+1,bottom-top+1); cropped.getContext('2d').drawImage(source,left,top,cropped.width,cropped.height,0,0,cropped.width,cropped.height);
  const id=`animation-${Date.now()}-${Math.random().toString(36).slice(2)}`, layers=ensureAnimationLayers(), index=layers.findIndex(item=>item.id===layer.id);
  layers.splice(index,0,{id,name:`${layer.name} split`,visible:true,base:false});
  const frame=state.frames[state.currentFrame]; frame.animationCels ||= {};
  frame.animationCels[id]={canvas:cropped,offsetX:left-Math.round((state.cageWidth-cropped.width)/2),offsetY:top-Math.round((state.cageHeight-cropped.height)/2),flipX:false,flipY:false};
  state.activeAnimationLayerId=id; animationSelection=null; state.animationTool='move'; showError(''); animationChanged();
}
function setAnimationTool(tool) {
  const previous = state.animationTool;
  const selection = animationSelection;
  clearActiveCanvasTools(false);
  state.animationTool = previous === tool && tool !== 'move' ? 'move' : tool;
  if (['pencil','eraser','dropper'].includes(state.animationTool)) animationSelection = selection;
  drawFrame(state.currentFrame); updateInfo();
}
function animationPoint(e) {
  const p=pointerGuidePoint(e);
  return {x:clamp(Math.round(p.x),0,state.cageWidth),y:clamp(Math.round(p.y),0,state.cageHeight)};
}
function startAnimationCanvasDrag(e) {
  if(!animationPanelActive() || !hasFrames()) return false;
  const layer=activeAnimationLayer(), tool=state.animationTool || 'move';
  if(tool==='move' && (rulerHit(e) || pivotHit(e))) return false;
  if(tool==='dropper' || ((e.ctrlKey||e.metaKey) && tool==='pencil')) {
    const p=pointerCagePoint(e); if(p) {const color=sampleVisibleFrameColor(state.currentFrame,p.x,p.y,{allowTransparent:true});if(color)setPencilColorAt(state.activePencilColorIndex,color,{refresh:false});}
    if(tool==='dropper')state.animationTool='pencil'; updateInfo(); return true;
  }
  if(!animationLayerVisible(layer) || !animationCel(layer)) return true;
  pause();
  if(tool==='rectangle'||tool==='lasso') {
    const p=animationPoint(e);animationSelection={kind:tool,points:[p,p],frameId:state.frames[state.currentFrame].id,layerId:layer.id};
  } else {
    pushHistory();
    if(tool==='pencil'||tool==='eraser') {
      if(layer.base)animationBakeBase(state.currentFrame);
      else animationBakeCel(layer,state.currentFrame);
    }
  }
  const cel=animationCel(layer);
  animationStroke={layerId:layer.id,frame:state.currentFrame,tool,last:pointerGuidePoint(e),startX:e.clientX,startY:e.clientY,offsetX:cel.offsetX,offsetY:cel.offsetY};
  state.activeAnimationLayerId=layer.id;state.dragging=true;state.dragMode=`animation-${tool}`;state.dragPointerId=e.pointerId;
  els.canvasShell.classList.add('dragging');els.canvasShell.setPointerCapture(e.pointerId);
  if(tool==='pencil'||tool==='eraser') { updateBrushCursorFromEvent(e); paintAnimationLine(animationStroke.last,animationStroke.last); }
  drawFrame(state.currentFrame);updateAnimationUi();return true;
}
function paintAnimationLine(a,b) {
  const stroke=animationStroke,layer=animationLayerList().find(item=>item.id===stroke.layerId),cel=animationCel(layer,stroke.frame);
  if(!cel)return;
  const p=layer.base?{x:0,y:0}:animationCelPosition(cel),canvas=cel.canvas,t=canvas.getContext('2d');
  const size=Math.max(1,Math.round(state.animationBrushSize||1)),mask=animationSelectionMask();
  t.save();
  if(mask) {
    // Paint through the selection without changing pixels outside it.
    const stencil=layer.base?mask:animationLocalMask(mask,cel),image=stencil.getContext('2d').getImageData(0,0,stencil.width,stencil.height),path=new Path2D();
    for(let y=0;y<stencil.height;y++)for(let x=0;x<stencil.width;x++)if(image.data[(y*stencil.width+x)*4+3])path.rect(x,y,1,1);
    t.clip(path);
  }
  if(stroke.tool==='eraser')t.globalCompositeOperation='destination-out';
  const distance=Math.max(Math.abs(b.x-a.x),Math.abs(b.y-a.y)),steps=Math.max(1,Math.ceil(distance));
  for(let k=0;k<=steps;k++) {
    let x=Math.floor(a.x+(b.x-a.x)*k/steps)-p.x,y=Math.floor(a.y+(b.y-a.y)*k/steps)-p.y;
    if(cel.flipX)x=canvas.width-1-x;if(cel.flipY)y=canvas.height-1-y;
    stampHardPencil(t,x+.5,y+.5,size,stroke.tool==='eraser'?{r:0,g:0,b:0,a:255}:state.pencilColor);
  }
  t.restore();
  if(layer.base)state.frames[stroke.frame].sourceCanvas=canvasClone(canvas);
  state.indexedFrames[stroke.frame]=null;markFrameBitmapsDirty();
}
function moveAnimationCanvasDrag(e) {
  const stroke=animationStroke;if(!stroke)return;
  if(stroke.tool==='rectangle'||stroke.tool==='lasso') {
    const p=animationPoint(e);
    if(stroke.tool==='rectangle')animationSelection.points[1]=p;
    else {const last=animationSelection.points[animationSelection.points.length-1];if(Math.hypot(p.x-last.x,p.y-last.y)>=.5)animationSelection.points.push(p);}
  } else if(stroke.tool==='move') {
    const layer=animationLayerList().find(item=>item.id===stroke.layerId),cel=animationCel(layer,stroke.frame),d=pointerDelta(e,stroke.startX,stroke.startY);
    if(!cel)return;
    if(layer.base)state.frameOffsets[stroke.frame]={x:Math.round(stroke.offsetX+d.dx),y:Math.round(stroke.offsetY+d.dy)};
    else {cel.offsetX=Math.round(stroke.offsetX+d.dx);cel.offsetY=Math.round(stroke.offsetY+d.dy);}
    animationSelection=null;
  } else if(stroke.tool==='pencil'||stroke.tool==='eraser') {
    const p=pointerGuidePoint(e);updateBrushCursorFromEvent(e);paintAnimationLine(stroke.last,p);stroke.last=p;
  }
  drawFrame(state.currentFrame,{fast:true,skipThumb:true});updateAnimationUi();
}
function finishAnimationCanvasDrag(e) {
  const stroke=animationStroke;animationStroke=null;
  state.dragging=false;state.dragMode='offset';state.dragPointerId=null;els.canvasShell.classList.remove('dragging');
  if(els.canvasShell.hasPointerCapture(e.pointerId))els.canvasShell.releasePointerCapture(e.pointerId);
  if(e.type==='pointercancel' || (stroke?.tool==='lasso' && animationSelection?.points.length<3))animationSelection=null;
  if(stroke && ['move','pencil','eraser'].includes(stroke.tool))animationChanged();
  else {drawFrame(state.currentFrame);updateAnimationUi();}
}
function handleAnimationKeyDown(e) {
  if(!animationPanelActive()||e.ctrlKey||e.metaKey||e.altKey)return false;
  const key=e.key.toLowerCase();
  if(e.key==='Escape') {animationSelection=null;state.animationTool='move';drawFrame(state.currentFrame);updateInfo();e.preventDefault();return true;}
  const tools={m:'move',l:'lasso',r:'rectangle',p:'pencil',d:'dropper',e:'eraser'};
  if(!e.shiftKey&&tools[key]){e.preventDefault();setAnimationTool(tools[key]);return true;}
  if(!e.shiftKey&&['b','g','w','h'].includes(key)){e.preventDefault();return true;}
  if(e.shiftKey&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) {
    const layer=activeAnimationLayer(),cel=animationCel(layer);if(!cel)return true;
    e.preventDefault();const axis=['ArrowLeft','ArrowRight'].includes(e.key)?'x':'y',delta=['ArrowLeft','ArrowUp'].includes(e.key)?-1:1;
    setAnimationOffset(layer.id,axis,cel[axis==='x'?'offsetX':'offsetY']+delta);return true;
  }
  return false;
}

animationEls.input.addEventListener('change',e=>loadAnimationSprites(e.target.files));
['dragenter','dragover'].forEach(type=>animationEls.drop.addEventListener(type,e=>{e.preventDefault();animationEls.drop.classList.add('dragover');}));
['dragleave','drop'].forEach(type=>animationEls.drop.addEventListener(type,e=>{e.preventDefault();animationEls.drop.classList.remove('dragover');}));
animationEls.drop.addEventListener('drop',e=>loadAnimationSprites(e.dataTransfer.files));
animationEls.group.querySelectorAll('[data-animation-tool]').forEach(button=>button.addEventListener('click',()=>setAnimationTool(button.dataset.animationTool)));
animationEls.split.addEventListener('click',splitAnimationSelection);
$('animationClearSelectionButton').addEventListener('click',()=>{animationSelection=null;drawFrame(state.currentFrame);updateAnimationUi();});
animationEls.size.addEventListener('input',e=>setAnimationBrushSize(e.target.value));
animationEls.colors.addEventListener('click',e=>{
  const button=e.target.closest('[data-animation-color]');if(!button)return;const index=Number(button.dataset.animationColor);
  if(index===state.activePencilColorIndex)openColorPicker({type:'pencil',index},state.pencilColors[index]||state.pencilColor,'Pencil Color');
  else{state.activePencilColorIndex=index;state.pencilColor=cloneColor(state.pencilColors[index]);updateInfo();}
});
animationEls.list.addEventListener('click',e=>{
  if(animationLayerDrag?.active)return;
  const item=e.target.closest('[data-animation-id]');if(!item||e.target.closest('input'))return;
  const id=item.dataset.animationId,action=e.target.closest('[data-animation-action]')?.dataset.animationAction;
  if(action==='remove'){removeAnimationLayer(id);return;}
  if(action==='visible'){toggleAnimationVisibility(id);return;}
  const flip=e.target.closest('[data-animation-flip]');if(flip){toggleAnimationFlip(id,flip.dataset.animationFlip);return;}
  selectAnimationLayer(id);
});
animationEls.list.addEventListener('dblclick',e=>{
  const name=e.target.closest('.animation-layer-name'),item=name?.closest('[data-animation-id]');if(!item)return;
  const layer=animationLayerList().find(layer=>layer.id===item.dataset.animationId),input=document.createElement('input');input.type='text';input.className='reference-layer-rename-input animation-layer-rename-input';input.value=layer.name;input.setAttribute('aria-label','Sprite layer name');name.replaceWith(input);input.focus();input.select();
  let done=false;const finish=commit=>{if(done)return;done=true;if(commit)renameAnimationLayer(layer.id,input.value);else updateAnimationUi(true);};
  input.addEventListener('blur',()=>finish(true));input.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key==='Escape'){e.preventDefault();e.stopPropagation();finish(e.key==='Enter');}});
});
animationEls.list.addEventListener('focusin',e=>{if(e.target.matches('[data-animation-offset]')){pause();animationInputHistory=null;}});
animationEls.list.addEventListener('input',e=>{
  const input=e.target;if(!input.matches('[data-animation-offset]'))return;
  const id=input.closest('[data-animation-id]').dataset.animationId,key=`${id}:${state.currentFrame}:${input.dataset.animationOffset}`;
  if(animationInputHistory!==key){pushHistory();animationInputHistory=key;}
  setAnimationOffset(id,input.dataset.animationOffset,input.value,false);
});
animationEls.list.addEventListener('change',e=>{if(e.target.matches('[data-animation-offset]')){animationInputHistory=null;animationChanged();}});
animationEls.list.addEventListener('keydown',e=>{
  if(e.target.closest('input'))return;
  const item=e.target.closest('[data-animation-id]');if(!item||!e.altKey||!['ArrowUp','ArrowDown'].includes(e.key))return;
  const layers=animationLayerList(),i=layers.findIndex(layer=>layer.id===item.dataset.animationId),target=layers[i+(e.key==='ArrowUp'?-1:1)];
  if(target){e.preventDefault();e.stopPropagation();moveAnimationLayer(item.dataset.animationId,target.id,e.key==='ArrowDown');}
});
animationEls.list.addEventListener('pointerdown',e=>{
  const name=e.target.closest('.animation-layer-name');if(!name||e.button!==0)return;
  animationLayerDrag={id:name.closest('[data-animation-id]').dataset.animationId,pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,target:name,active:false};
});
document.addEventListener('pointermove',e=>{
  const drag=animationLayerDrag;if(!drag||drag.pointerId!==e.pointerId)return;
  if(!drag.active&&Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)<5)return;
  e.preventDefault();drag.active=true;drag.target.setPointerCapture(e.pointerId);
  const items=[...animationEls.list.querySelectorAll('[data-animation-id]')];items.forEach(item=>item.classList.remove('animation-drop-before','animation-drop-after','dragging-animation'));
  items.find(item=>item.dataset.animationId===drag.id)?.classList.add('dragging-animation');
  const other=items.filter(item=>item.dataset.animationId!==drag.id);let target=other.find(item=>e.clientY<item.getBoundingClientRect().bottom)||other[other.length-1];
  if(target){const r=target.getBoundingClientRect();drag.targetId=target.dataset.animationId;drag.after=e.clientY>=r.top+r.height/2;target.classList.add(drag.after?'animation-drop-after':'animation-drop-before');}
  const listRect=animationEls.list.getBoundingClientRect();if(e.clientY<listRect.top+24)animationEls.list.scrollTop-=12;else if(e.clientY>listRect.bottom-24)animationEls.list.scrollTop+=12;
},{passive:false});
function finishAnimationLayerDrag(e) {
  const drag=animationLayerDrag;if(!drag||drag.pointerId!==e.pointerId)return;
  animationLayerDrag=null;if(drag.target.hasPointerCapture?.(e.pointerId))drag.target.releasePointerCapture(e.pointerId);
  animationEls.list.querySelectorAll('[data-animation-id]').forEach(item=>item.classList.remove('animation-drop-before','animation-drop-after','dragging-animation'));
  if(drag.active){e.preventDefault();if(e.type!=='pointercancel'&&drag.targetId)moveAnimationLayer(drag.id,drag.targetId,drag.after);}
}
document.addEventListener('pointerup',finishAnimationLayerDrag);document.addEventListener('pointercancel',finishAnimationLayerDrag);
resetAnimationState();
