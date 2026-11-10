// Animation layers use the existing frame timeline. Cels belong to frame records,
// so timeline duplication, deletion, and reordering keep artwork with its frame.
const ANIMATION_BASE_ID = 'animation-base';
const ANIMATION_GRID_PADDING = 'animation-grid-padding';
const ANIMATION_SELECTION_TOOLS = {
  lasso: { label: 'Lasso selection (L)', icon: 'selection-lasso.svg' },
  rectangle: { label: 'Rectangle selection (R)', icon: 'selection-rectangle.svg' },
  wand: { label: 'Magic Wand (W)', icon: 'wand.svg' }
};
const animationEls = {
  group: $('animationGroup'), input: $('animationFileInput'), drop: $('animationDropZone'),
  list: $('animationLayerList'), split: $('animationSplitButton'), colors: $('animationColorStrip'),
  size: $('animationBrushSizeInput'), sizeValue: $('animationBrushSizeValue'), sizeField: $('animationBrushSizeField'),
  selectionButton: $('animationSelectionToolButton'), selectionMenu: $('animationSelectionToolMenu'),
  wandSettings: $('animationWandSettings'), wandAntialias: $('animationWandAntialias'),
  wandContiguous: $('animationWandContiguous'), wandTolerance: $('animationWandTolerance'),
  selectionActions: $('animationSelectionActions'), newLayer: $('animationNewLayerButton'), newGroup: $('animationGroupLayersButton'), merge: $('animationMergeButton'),
  exportLayer: $('animationExportLayerButton'),
  copy: $('animationCopyButton'), paste: $('animationPasteButton')
};
let animationSelection = null;
let animationStroke = null;
let animationPaintAnchor = null;
let animationPaintShiftHeld = false;
let animationLayerDrag = null;
let animationInputHistory = null;
let animationClipboard = null;
let animationSelectionRasterCache = null;
let animationSelectionOverlay = null;
let animationSelectionAnimationId = null;
let animationSelectionLastPaint = 0;
let animationSelectionHold = null;
let animationSelectionHeld = false;

function animationWandSettings(saved = state.animationWandSettings) {
  const tolerance = Number(saved?.tolerance);
  return {
    antialias: saved?.antialias === true,
    contiguous: saved?.contiguous !== false,
    tolerance: Number.isFinite(tolerance) ? clamp(Math.round(tolerance), 0, 255) : 32
  };
}

function cancelAnimationSelectionHold() {
  if (animationSelectionHold !== null) clearTimeout(animationSelectionHold);
  animationSelectionHold = null;
}
function setAnimationSelectionMenuOpen(open) {
  if (!open) cancelAnimationSelectionHold();
  if (animationEls.selectionMenu.hidden !== !open) {
    animationEls.selectionMenu.hidden = !open;
    animationEls.selectionButton.setAttribute('aria-expanded', String(open));
  }
}

function animationPanelActive() {
  return animationEls.group.classList.contains('inspector-active') && !animationBuilderCompanionActive() && !state.referenceCompositorVisible;
}
function animationBuilderCompanionActive() {
  return animationEls.group.classList.contains('sprite-sheet-builder-tool-panel');
}
function animationPixelBrushActive() {
  return animationPanelActive() && !activeAnimationLayer()?.group && ['pencil','eraser'].includes(state.animationTool);
}
function setAnimationBrushSize(value) {
  if (animationBuilderCompanionActive()) {
    state.brushSize = clamp(Math.round(Number(value) || 1), 1, 120);
    updateAnimationUi();
    renderBrushCursorOverlay();
    return;
  }
  if (animationStroke?.points?.length) paintAnimationStroke(animationStroke);
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
  const layers = animationFrameLayers();
  return layers.find(layer => layer.id === state.activeAnimationLayerId) || layers[0] || null;
}
function animationFrameLayers(i = state.currentFrame) {
  const layers=animationLayerList(), frame=state.frames[i], available=new Set();
  if (!frame) return [];
  layers.forEach(layer=>{
    if (!animationCel(layer,i)?.canvas) return;
    available.add(layer.id);animationAncestors(layer,layers).forEach(parent=>available.add(parent.id));
  });
  return layers.filter(layer=>available.has(layer.id));
}
function normalizeAnimationOpacity(value) {
  const percent = value == null ? 100 : Number(value);
  return Number.isFinite(percent) ? clamp(Math.round(percent), 0, 100) : 100;
}
function cloneAnimationLayers(layers, copySharedCel = cloneAnimationCel, copySheet = source => source) {
  if (!Array.isArray(layers)) return null;
  const copy = layers.map(layer => {
    const record = { id: String(layer.id), name: String(layer.name || (layer.group ? 'Group' : 'Sprite')), visible: layer.visible !== false,
      base: layer.id === ANIMATION_BASE_ID, group: !!layer.group && layer.id !== ANIMATION_BASE_ID, parentId: String(layer.parentId || ''), collapsed: !!layer.collapsed, opacity: normalizeAnimationOpacity(layer.opacity) };
    if (!record.group && layer.sharedCel) record.sharedCel = copySharedCel(layer.sharedCel);
    if (!record.group && !record.base && layer.sheetCanvas) record.sheetCanvas = copySheet(layer.sheetCanvas);
    if (!record.group && layer.sourceFrameCount > 1) record.sourceFrameCount = layer.sourceFrameCount;
    return record;
  });
  const byId = new Map(copy.map(layer => [layer.id,layer]));
  copy.forEach(layer => {
    const seen = new Set([layer.id]); let parent = byId.get(layer.parentId);
    if (layer.parentId && !parent?.group) layer.parentId = '';
    while (parent) {
      if (seen.has(parent.id)) { layer.parentId = ''; break; }
      seen.add(parent.id); parent = byId.get(parent.parentId);
    }
  });
  const ordered = [], visited = new Set();
  function append(parentId) {
    copy.filter(layer => layer.parentId === parentId).forEach(layer => {
      if (visited.has(layer.id)) return;
      visited.add(layer.id); ordered.push(layer); if (layer.group) append(layer.id);
    });
  }
  append('');
  return ordered;
}
function animationAncestors(layer, layers = animationLayerList()) {
  const ancestors = [], seen = new Set([layer?.id]);
  let parentId = layer?.parentId;
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId); const parent = layers.find(item => item.id === parentId && item.group);
    if (!parent) break;
    ancestors.push(parent); parentId = parent.parentId;
  }
  return ancestors;
}
function animationSubtreeIds(id, layers = animationLayerList()) {
  return new Set(layers.filter(layer => layer.id === id || animationAncestors(layer,layers).some(parent => parent.id === id)).map(layer => layer.id));
}
function animationVisibleLayers() {
  const layers = animationLayerList();
  return animationFrameLayers().filter(layer => !animationAncestors(layer,layers).some(parent => parent.collapsed));
}
function selectedAnimationLayerIds() {
  const layers = animationFrameLayers(), selected = (state.selectedAnimationLayerIds || []).filter(id => layers.some(layer => layer.id === id));
  return selected.length ? selected : (activeAnimationLayer() ? [activeAnimationLayer().id] : []);
}
function animationLayerOwnVisible(layer, i = state.currentFrame) {
  const visible = state.frames[i]?.animationVisibility?.[layer.id];
  return typeof visible === 'boolean' ? visible : layer.visible !== false;
}
function cloneAnimationVisibility(visibility = {}) {
  return Object.fromEntries(Object.entries(visibility || {}).filter(([,visible]) => typeof visible === 'boolean'));
}
function animationLayerVisible(layer, i = state.currentFrame) {
  if (!layer) return false;
  return animationLayerOwnVisible(layer,i) && animationAncestors(layer).every(parent => animationLayerOwnVisible(parent,i));
}
function toggleAnimationVisibility(id) {
  const layer = animationLayerList().find(layer => layer.id === id), frame = state.frames[state.currentFrame];
  if (!layer || !frame) return;
  pause();
  const visible = animationLayerOwnVisible(layer);
  pushHistory();
  ensureAnimationLayers();
  frame.animationVisibility = { ...cloneAnimationVisibility(frame.animationVisibility), [id]: !visible };
  animationChanged();
}
function animationCelTransform(cel) {
  return { offsetX: Math.round(cel.offsetX || 0), offsetY: Math.round(cel.offsetY || 0), flipX: !!cel.flipX, flipY: !!cel.flipY };
}
function cloneAnimationCel(cel) {
  const clone = { canvas: canvasClone(cel.canvas), ...animationCelTransform(cel) };
  if (cel.mask) clone.mask = canvasClone(cel.mask);
  return clone;
}
function serializeAnimationCel(cel) {
  const saved = { data: cel.canvas.toDataURL('image/png'), ...animationCelTransform(cel) };
  if (cel.mask) saved.mask = cel.mask.toDataURL('image/png');
  return saved;
}
async function restoreAnimationCel(cel) {
  const restored = { canvas: await canvasFromDataURL(cel.data), ...animationCelTransform(cel) };
  if (cel.mask) restored.mask = await canvasFromDataURL(cel.mask);
  return restored;
}
function serializeAnimationLayers(layers) {
  return cloneAnimationLayers(layers, serializeAnimationCel, canvas => canvas.toDataURL('image/png'));
}
async function restoreAnimationLayers(layers) {
  const restored = cloneAnimationLayers(layers, cel => cel);
  if (!restored) return null;
  for (const layer of restored) {
    if (layer.sharedCel?.data) layer.sharedCel = await restoreAnimationCel(layer.sharedCel);
    else delete layer.sharedCel;
    if (typeof layer.sheetCanvas === 'string') layer.sheetCanvas = await canvasFromDataURL(layer.sheetCanvas);
    else delete layer.sheetCanvas;
  }
  return restored;
}
function cloneAnimationCels(cels = {}) {
  return Object.fromEntries(Object.entries(cels || {}).filter(([,cel]) => cel?.canvas).map(([id,cel]) => [id, cloneAnimationCel(cel)]));
}
function serializeAnimationCels(cels = {}) {
  return Object.fromEntries(Object.entries(cels || {}).filter(([,cel]) => cel?.canvas).map(([id,cel]) => [id, serializeAnimationCel(cel)]));
}
async function restoreAnimationCels(cels = {}) {
  const restored = {};
  for (const [id,cel] of Object.entries(cels || {})) {
    if (!cel?.data) continue;
    restored[id] = await restoreAnimationCel(cel);
  }
  return restored;
}
function resetAnimationTools() {
  setAnimationSelectionMenuOpen(false);
  state.animationTool = 'move';
  animationSelection = null;
  animationStroke = null;
  animationPaintAnchor = null;
  animationInputHistory = null;
  animationSelectionRasterCache = null;
  hideAnimationSelectionOverlay();
}
function resetAnimationState() {
  state.animationLayers = null;
  state.activeAnimationLayerId = '';
  state.selectedAnimationLayerIds = [];
  state.animationSelectionAnchorId = '';
  state.animationBrushSize = 1;
  state.animationWandSettings = animationWandSettings({});
  resetAnimationTools();
}
function animationLayerUsesBaseFrame(layer) {
  return !!layer?.base && !layer.sharedCel;
}
function animationCel(layer, i = state.currentFrame) {
  const frame = state.frames[i];
  if (!layer || layer.group || !frame) return null;
  if (layer.sharedCel) return layer.sharedCel;
  if (layer.base) {
    const offset = state.frameOffsets[i] || { x: 0, y: 0 };
    return { canvas: frame.canvas, offsetX: offset.x, offsetY: offset.y, flipX: frameFlipX(i), flipY: frameFlipY(i) };
  }
  return frame.animationCels?.[layer.id] || null;
}
function animationCelPosition(cel, cageWidth = state.cageWidth, cageHeight = state.cageHeight) {
  return { x: Math.round((cageWidth - cel.canvas.width) / 2) + Math.round(cel.offsetX || 0), y: Math.round((cageHeight - cel.canvas.height) / 2) + Math.round(cel.offsetY || 0) };
}
function selectedAnimationMaskLayer() {
  const layer = state.animationLayers?.find(item => item.id === state.activeAnimationLayerId);
  return layer && !animationLayerUsesBaseFrame(layer) ? layer : null;
}
function animationCelPixel(cel, x, y) {
  const position = animationCelPosition(cel);
  const localX = x - position.x, localY = y - position.y;
  return {
    x: cel.flipX ? cel.canvas.width - 1 - localX : localX,
    y: cel.flipY ? cel.canvas.height - 1 - localY : localY
  };
}
function animationMaskedCels() {
  const shared = animationLayerList().map(layer => layer.sharedCel).filter(cel => cel?.mask);
  const local = state.frames.flatMap(frame => Object.values(frame.animationCels || {}).filter(cel => cel.mask));
  return [...shared, ...local];
}
function animationMovementTargets(layer, i = state.currentFrame) {
  const layers = animationLayerList(), ids = animationSubtreeIds(layer?.id,layers);
  return layers.filter(item => ids.has(item.id) && !item.group && animationCel(item,i));
}
function animationLayerBounds(layer, i = state.currentFrame) {
  const cel = animationCel(layer,i);
  if (!cel) return null;
  const base = animationLayerUsesBaseFrame(layer);
  const position = base ? framePos(i) : animationCelPosition(cel), scale = base ? frameScale(i) : {x:1,y:1};
  return { left:position.x, top:position.y, right:position.x+cel.canvas.width*scale.x, bottom:position.y+cel.canvas.height*scale.y };
}
function animationGroupBounds(layer, i = state.currentFrame) {
  const bounds = animationMovementTargets(layer,i).map(item => animationLayerBounds(item,i));
  return bounds.length ? { left:Math.min(...bounds.map(b=>b.left)), top:Math.min(...bounds.map(b=>b.top)), right:Math.max(...bounds.map(b=>b.right)), bottom:Math.max(...bounds.map(b=>b.bottom)) } : null;
}
function animationLayerOffset(layer, i = state.currentFrame) {
  if (!layer?.group) { const cel = animationCel(layer,i); return cel ? {x:cel.offsetX,y:cel.offsetY} : null; }
  const bounds = animationGroupBounds(layer,i);
  return bounds ? {x:Math.round((bounds.left+bounds.right-state.cageWidth)/2),y:Math.round((bounds.top+bounds.bottom-state.cageHeight)/2)} : null;
}
function writeAnimationOffset(layer, i, x, y) {
  if (animationLayerUsesBaseFrame(layer)) state.frameOffsets[i] = {x:Math.round(x),y:Math.round(y)};
  else { const cel=animationCel(layer,i); if(cel) {cel.offsetX=Math.round(x);cel.offsetY=Math.round(y);} }
}
function newAnimationId(kind = 'layer') { return `animation-${kind}-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
function uniqueAnimationName(prefix) {
  const names = new Set(animationLayerList().map(layer=>layer.name)); let n=1;
  while (names.has(`${prefix} ${n}`)) n++;
  return `${prefix} ${n}`;
}
function createEmptyAnimationLayer() {
  if (!hasFrames()) return;
  pause(); pushHistory();
  const layers=ensureAnimationLayers(), active=activeAnimationLayer(), id=newAnimationId(), name=uniqueAnimationName('Layer');
  const index=active ? layers.findIndex(layer=>layer.id===active.id) : 0;
  layers.splice(Math.max(0,index),0,{id,name,visible:true,base:false,parentId:active?.parentId || ''});
  state.frames.forEach(frame=>{frame.animationCels ||= {};frame.animationCels[id]={canvas:makeMask(),offsetX:0,offsetY:0,flipX:false,flipY:false};});
  state.activeAnimationLayerId=id;state.selectedAnimationLayerIds=[id];state.animationSelectionAnchorId=id;
  animationSelection=null;state.animationTool='move';animationChanged();
}
function captureAnimationCel(layer) {
  const cel = animationCel(layer);
  if (!cel?.canvas) return null;
  if (!animationLayerUsesBaseFrame(layer)) return cloneAnimationCel(cel);
  // Capture the visible base without baking or changing the source frame.
  const canvas = makeMask();
  drawBaseSprite(canvas.getContext('2d'), state.currentFrame, 0, 0, { applyMask: true });
  return { canvas, offsetX: 0, offsetY: 0, flipX: false, flipY: false };
}
function toggleAnimationAllFrames(id) {
  const layer = animationLayerList().find(item => item.id === id);
  if (!animationCel(layer)?.canvas) return;
  pause();
  pushHistory();
  const target = ensureAnimationLayers().find(item => item.id === id);
  if (target.sharedCel) delete target.sharedCel;
  else target.sharedCel = captureAnimationCel(target);
  animationChanged();
}
function copyAnimationLayers() {
  if (!hasFrames()) return false;
  const layers=animationLayerList(), selected=new Set(selectedAnimationLayerIds());
  const roots=layers.filter(layer=>selected.has(layer.id) && !animationAncestors(layer,layers).some(parent=>selected.has(parent.id)));
  if (!roots.length) return false;
  const rootIds=new Set(roots.map(layer=>layer.id));
  const ids=new Set(roots.flatMap(layer=>[...animationSubtreeIds(layer.id,layers)]));
  const records=animationFrameLayers().filter(layer=>ids.has(layer.id)).map(layer=>{
    const cel = captureAnimationCel(layer);
    return {id:layer.id,name:layer.name,group:!!layer.group,collapsed:!!layer.collapsed,
      parentId:rootIds.has(layer.id)?'':layer.parentId,
      visible:rootIds.has(layer.id)?animationLayerVisible(layer):animationLayerOwnVisible(layer),opacity:layer.opacity,cel};
  });
  animationClipboard={records};
  updateAnimationUi();
  return true;
}
function pasteAnimationLayers() {
  if (!hasFrames() || !animationClipboard?.records.length) return false;
  pause();pushHistory();
  const layers=ensureAnimationLayers(), active=activeAnimationLayer(), frame=state.frames[state.currentFrame];
  const ids=new Map(animationClipboard.records.map(record=>[record.id,newAnimationId(record.group?'group':'layer')]));
  const names=new Set(layers.map(layer=>layer.name)), roots=[];
  frame.animationCels ||= {};frame.animationVisibility ||= {};
  const copies=animationClipboard.records.map(record=>{
    const id=ids.get(record.id);let name=record.name;
    if (names.has(name)) { const prefix=`${name} copy`;name=prefix;let n=2;while(names.has(name))name=`${prefix} ${n++}`; }
    names.add(name);
    if (!record.parentId) roots.push(id);
    if (!record.group) frame.animationCels[id]=record.cel ? cloneAnimationCels({source:record.cel}).source : {canvas:makeMask(),offsetX:0,offsetY:0,flipX:false,flipY:false};
    frame.animationVisibility[id]=record.visible;
    return {id,name,base:false,group:record.group,collapsed:record.collapsed,visible:true,opacity:record.opacity,
      parentId:ids.get(record.parentId) || active?.parentId || ''};
  });
  const index=active ? layers.findIndex(layer=>layer.id===active.id) : 0;
  layers.splice(Math.max(0,index),0,...copies);
  state.animationLayers=cloneAnimationLayers(layers);
  state.activeAnimationLayerId=roots[0];state.selectedAnimationLayerIds=roots;state.animationSelectionAnchorId=roots[0];
  animationSelection=null;state.animationTool='move';animationChanged();
  return true;
}
function createAnimationGroup() {
  const layers=animationLayerList(), selected=new Set(selectedAnimationLayerIds());
  const roots=layers.filter(layer=>selected.has(layer.id) && !animationAncestors(layer,layers).some(parent=>selected.has(parent.id)));
  if (!roots.length || !hasFrames()) return;
  pause();pushHistory();ensureAnimationLayers();
  const parentPaths=roots.map(layer=>[...animationAncestors(layer,layers).map(parent=>parent.id),'']);
  const parentId=parentPaths[0].find(id=>parentPaths.every(path=>path.includes(id))) || '';
  let anchor=roots[0];
  while ((anchor.parentId || '')!==parentId) anchor=layers.find(layer=>layer.id===anchor.parentId);
  const memberIds=new Set(roots.flatMap(layer=>[...animationSubtreeIds(layer.id,layers)]));
  const members=layers.filter(layer=>memberIds.has(layer.id)), remaining=layers.filter(layer=>!memberIds.has(layer.id));
  const at=memberIds.has(anchor.id) ? layers.slice(0,layers.indexOf(anchor)).filter(layer=>!memberIds.has(layer.id)).length : remaining.indexOf(anchor);
  const id=newAnimationId('group'), group={id,name:uniqueAnimationName('Group'),visible:true,group:true,base:false,parentId,collapsed:true};
  roots.forEach(layer=>{layer.parentId=id;});
  remaining.splice(Math.max(0,at),0,group,...members);
  state.animationLayers=cloneAnimationLayers(remaining);state.activeAnimationLayerId=id;state.selectedAnimationLayerIds=[id];state.animationSelectionAnchorId=id;
  animationSelection=null;state.animationTool='move';animationChanged();
}
function mergeAnimationLayers() {
  const layers=animationLayerList(), selected=new Set(selectedAnimationLayerIds());
  const roots=layers.filter(layer=>selected.has(layer.id) && !animationAncestors(layer,layers).some(parent=>selected.has(parent.id)));
  if(!hasFrames() || !roots.length || (roots.length===1 && !roots[0].group))return false;
  const parentPaths=roots.map(layer=>[...animationAncestors(layer,layers).map(parent=>parent.id),'']);
  const parentId=parentPaths[0].find(id=>parentPaths.every(path=>path.includes(id))) || '';
  const memberIds=new Set(roots.flatMap(layer=>[...animationSubtreeIds(layer.id,layers)]));
  const leaves=layers.filter(layer=>memberIds.has(layer.id) && !layer.group), id=newAnimationId();
  const name=roots.length===1?roots[0].name:uniqueAnimationName('Merged Layer');
  // Bake visibility and opacity below the surviving parent.
  const renderIds = new Set(memberIds);
  for (const root of roots) {
    for (const parent of animationAncestors(root, layers)) {
      if (parent.id === parentId) break;
      renderIds.add(parent.id);
    }
  }
  const renderLayers = layers.filter(layer => renderIds.has(layer.id));
  const cels=state.frames.map((_frame,i)=>{
    if(!leaves.some(layer=>animationCel(layer,i)))return null;
    const canvas=makeMask(),t=canvas.getContext('2d');t.imageSmoothingEnabled=false;
    drawAnimationLayers(t, renderLayers, i, 0, 0, { parentId });
    return {canvas,offsetX:0,offsetY:0,flipX:false,flipY:false};
  });
  pause();pushHistory();
  let anchor=roots[0];while((anchor.parentId || '')!==parentId)anchor=layers.find(layer=>layer.id===anchor.parentId);
  const remaining=layers.filter(layer=>!memberIds.has(layer.id));
  const at=memberIds.has(anchor.id)?layers.slice(0,layers.indexOf(anchor)).filter(layer=>!memberIds.has(layer.id)).length:remaining.indexOf(anchor);
  remaining.splice(Math.max(0,at),0,{id,name,visible:true,base:false,group:false,parentId});
  state.animationLayers=cloneAnimationLayers(remaining);
  state.frames.forEach((frame,i)=>{
    memberIds.forEach(member=>{if(frame.animationCels)delete frame.animationCels[member];if(frame.animationVisibility)delete frame.animationVisibility[member];});
    if(cels[i]) {frame.animationCels ||= {};frame.animationCels[id]=cels[i];}
  });
  state.activeAnimationLayerId=id;state.selectedAnimationLayerIds=[id];state.animationSelectionAnchorId=id;
  animationSelection=null;state.animationTool='move';animationChanged();return true;
}
function toggleAnimationGroup(id) {
  const layer=ensureAnimationLayers().find(layer=>layer.id===id && layer.group);
  if (!layer) return;
  layer.collapsed=!layer.collapsed;updateAnimationUi(true);
}
const animationMaskedCanvases = new WeakMap();
function maskedAnimationCelCanvas(cel) {
  if (!cel.mask) return cel.canvas;
  const version = maskVersion(cel.mask), revision = state.frameBitmapRevision;
  const cached = animationMaskedCanvases.get(cel.mask);
  if (cached?.source === cel.canvas && cached.version === version && cached.revision === revision) return cached.canvas;
  const canvas = canvasClone(cel.canvas);
  applyMaskCanvasToCanvas(canvas, cel.mask);
  animationMaskedCanvases.set(cel.mask, { canvas, source: cel.canvas, version, revision });
  return canvas;
}
function animationLayerAlphaBounds(layer, i) {
  const cel = animationCel(layer, i), base = animationLayerUsesBaseFrame(layer);
  const canvas = base ? makeMask() : maskedAnimationCelCanvas(cel);
  if (base) drawBaseSprite(canvas.getContext('2d'), i, 0, 0, { applyMask: true });
  const alpha = canvasAlphaBounds(canvas, 1);
  if (!alpha) return null;
  const position = base ? { x: 0, y: 0 } : animationCelPosition(cel);
  const left = position.x + (!base && cel.flipX ? canvas.width - 1 - alpha.maxX : alpha.minX);
  const top = position.y + (!base && cel.flipY ? canvas.height - 1 - alpha.maxY : alpha.minY);
  return { left, top, right: left + alpha.maxX - alpha.minX + 1, bottom: top + alpha.maxY - alpha.minY + 1 };
}
function animationSpriteBounds(layer, i = state.currentFrame, measureBase = null) {
  let bounds = null;
  for (const item of animationMovementTargets(layer, i)) {
    if (!animationLayerVisible(item, i) || !animationEffectiveOpacity(item)) continue;
    const itemBounds = measureBase && animationLayerUsesBaseFrame(item) ? measureBase(i) : animationLayerAlphaBounds(item, i);
    if (!itemBounds) continue;
    const { left, top, right, bottom } = itemBounds;
    bounds = bounds ? {
      left: Math.min(bounds.left, left), top: Math.min(bounds.top, top),
      right: Math.max(bounds.right, right), bottom: Math.max(bounds.bottom, bottom)
    } : { left, top, right, bottom };
  }
  return bounds;
}
function exportAnimationLayerPng() {
  const layer = activeAnimationLayer(), i = state.currentFrame;
  if (!animationLayerVisible(layer, i)) return;
  try {
    const bounds = animationSpriteBounds(layer, i);
    if (!bounds) return showError('The selected layer has no visible pixels to export.');
    const canvas = makeMask(bounds.right - bounds.left, bounds.bottom - bounds.top);
    const context = canvas.getContext('2d');
    const ids = animationSubtreeIds(layer.id);
    const layers = animationLayerList().filter(item => ids.has(item.id));
    for (const parent of animationAncestors(layer)) context.globalAlpha *= normalizeAnimationOpacity(parent.opacity) / 100;
    drawAnimationLayers(context, layers, i, -bounds.left, -bounds.top, { parentId: layer.parentId || '', bounds });
    const alpha = canvasAlphaBounds(canvas, 1);
    if (!alpha) return showError('The selected layer has no visible pixels to export.');
    const blob = autoIndexedPngBlob(context.getImageData(alpha.minX, alpha.minY, alpha.maxX - alpha.minX + 1, alpha.maxY - alpha.minY + 1));
    const filename = layer.name.replace(/[^a-z0-9_-]+/gi, '_') || 'layer';
    showError();
    downloadBlob(blob, `${filename}.png`);
  } catch (error) {
    showError(error?.message || 'Could not export the selected layer.');
  }
}
function reframeAnimationCels(origin, oldWidth, oldHeight) {
  const cels = new Set(animationLayerList().map(layer => layer.sharedCel));
  for (const frame of state.frames) {
    for (const cel of Object.values(frame.animationCels || {})) cels.add(cel);
  }
  for (const cel of cels) {
    if (!cel?.canvas) continue;
    const before = animationCelPosition(cel, oldWidth, oldHeight), after = animationCelPosition(cel);
    cel.offsetX = Math.round(cel.offsetX || 0) + before.x - after.x - origin.x;
    cel.offsetY = Math.round(cel.offsetY || 0) + before.y - after.y - origin.y;
  }
}
function drawAnimationCel(t, cel, x = 0, y = 0, showMask = false) {
  if (!cel?.canvas) return;
  const p = animationCelPosition(cel), w = cel.canvas.width, h = cel.canvas.height;
  t.save();
  t.imageSmoothingEnabled = false;
  t.translate(x + p.x + (cel.flipX ? w : 0), y + p.y + (cel.flipY ? h : 0));
  t.scale(cel.flipX ? -1 : 1, cel.flipY ? -1 : 1);
  t.drawImage(showMask ? cel.canvas : maskedAnimationCelCanvas(cel), 0, 0);
  if (showMask && cel.mask) drawMaskCanvasOverlay(t, cel.mask, 0, 0);
  t.restore();
}
function drawAnimationSprite(t, i, x, y, opt = {}) {
  if (!Array.isArray(state.animationLayers)) return false;
  const maskLayer = opt.maskOverlay ? selectedAnimationMaskLayer() : null;
  const baseOptions = maskLayer ? { ...opt, maskOverlay: false, applyMask: true } : opt;
  t.save(); t.beginPath(); t.rect(x, y, state.cageWidth, state.cageHeight); t.clip();
  drawAnimationLayers(t, state.animationLayers, i, x, y, { baseOptions, maskLayer });
  t.restore();
  return true;
}
function drawAnimationLayers(target, layers, i, x, y, {
  parentId = '', baseOptions = { applyMask: true }, maskLayer = null,
  bounds = { left: 0, top: 0, right: state.cageWidth, bottom: state.cageHeight }
} = {}) {
  const children = new Map();
  for (const layer of layers) {
    const parent = layer.parentId || '';
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(layer);
  }
  function draw(t, parent, x, y) {
    const stack = children.get(parent) || [];
    for (let n = stack.length - 1; n >= 0; n--) {
      const layer = stack[n], alpha = normalizeAnimationOpacity(layer.opacity) / 100;
      if (!alpha || !animationLayerOwnVisible(layer, i)) continue;
      if (alpha < 1) {
        t.save();
        t.globalAlpha *= alpha;
      }
      if (layer.group && alpha < 1) {
        // Composite overlapping children before applying group opacity.
        const group = makeMask(bounds.right - bounds.left, bounds.bottom - bounds.top);
        draw(group.getContext('2d'), layer.id, -bounds.left, -bounds.top);
        t.drawImage(group, x + bounds.left, y + bounds.top);
      } else if (layer.group) {
        draw(t, layer.id, x, y);
      } else if (animationLayerUsesBaseFrame(layer)) {
        // Isolate the base's masks and blend modes from the other layers.
        const base = makeMask();
        drawBaseSprite(base.getContext('2d'), i, 0, 0, baseOptions);
        t.drawImage(base, x, y);
      } else {
        drawAnimationCel(t, animationCel(layer, i), x, y, layer.id === maskLayer?.id);
      }
      if (alpha < 1) t.restore();
    }
  }
  draw(target, parentId, x, y);
}
function animationEffectiveOpacity(layer) {
  return [layer, ...animationAncestors(layer)].reduce((alpha, item) => alpha * normalizeAnimationOpacity(item.opacity) / 100, 1);
}
function validAnimationSelection() {
  // The cage selection belongs to the frame and can be used on any of its layers.
  return animationSelection && animationSelection.frameId === state.frames[state.currentFrame]?.id;
}
function cloneAnimationSelection(selection = animationSelection) {
  if (!selection) return null;
  const copy = {...selection};
  if (selection.points) copy.points = selection.points.map(point => ({...point}));
  for (const key of ['alpha','subtractFrom','addTo']) if (selection[key]) copy[key] = selection[key].slice();
  return copy;
}
function animationSelectionHistoryState() {
  return {tool: state.animationTool || 'move', selection: validAnimationSelection() ? cloneAnimationSelection() : null};
}
function restoreAnimationSelectionHistory(saved) {
  state.animationTool = saved?.tool || 'move';
  animationSelection = cloneAnimationSelection(saved?.selection || null);
  animationSelectionRasterCache = null;
}
function commitAnimationSelection(next, previous = animationSelection) {
  const same = previous === next || (previous && next && previous.kind === next.kind
    && previous.frameId === next.frameId
    && (previous.offsetX || 0) === (next.offsetX || 0) && (previous.offsetY || 0) === (next.offsetY || 0)
    && previous.width === next.width && previous.height === next.height
    && JSON.stringify(previous.points) === JSON.stringify(next.points)
    && ['alpha','subtractFrom','addTo'].every(key => previous[key] === next[key]
      || (previous[key]?.length === next[key]?.length && previous[key]?.every((value,index) => value === next[key][index]))));
  animationSelection = previous;
  if (!same) pushHistory();
  animationSelection = next;
  return !same;
}
function rasterizeAnimationSelection(selection, width, height) {
  if (selection?.subtractFrom || selection?.addTo) {
    const shape=rasterizeAnimationSelection({...selection,subtractFrom:null,addTo:null},width,height);
    const base=selection.subtractFrom || selection.addTo;
    return base.map((value, index) => selection.subtractFrom ? Math.min(value, 255 - shape[index]) : Math.max(value, shape[index]));
  }
  if (selection?.kind==='mask') {
    const alpha=new Uint8Array(width*height), dx=Math.round(selection.offsetX || 0),dy=Math.round(selection.offsetY || 0);
    for(let y=Math.max(0,dy);y<Math.min(height,selection.height+dy);y++) {
      const left=Math.max(0,dx),right=Math.min(width,selection.width+dx);
      if(right>left)alpha.set(selection.alpha.subarray((y-dy)*selection.width+left-dx,(y-dy)*selection.width+right-dx),y*width+left);
    }
    return alpha;
  }
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
function translateAnimationSelection(selection,dx,dy) {
  const mask=selection.kind==='mask' ? selection : {...selection,kind:'mask',alpha:rasterizeAnimationSelection(selection,state.cageWidth,state.cageHeight),width:state.cageWidth,height:state.cageHeight,offsetX:0,offsetY:0};
  return {...mask,offsetX:(mask.offsetX||0)+Math.round(dx),offsetY:(mask.offsetY||0)+Math.round(dy)};
}
function moveAnimationSelection(dx,dy) {
  if (!validAnimationSelection()) return false;
  commitAnimationSelection(translateAnimationSelection(animationSelection,dx,dy));
  drawFrame(state.currentFrame);updateAnimationUi();return true;
}
function animationSelectionContainsPoint(e) {
  if (!validAnimationSelection()) return false;
  const p=pointerCagePoint(e);
  return !!(p && animationSelectionRaster()?.alpha[p.y*state.cageWidth+p.x]);
}
function animationSelectionRaster() {
  if (!validAnimationSelection()) return null;
  const width = state.cageWidth, height = state.cageHeight;
  const key = JSON.stringify([width,height,animationSelection.kind,animationSelection.points]);
  if (animationSelectionRasterCache?.selection === animationSelection && animationSelectionRasterCache?.key === key) return animationSelectionRasterCache;
  const alpha = rasterizeAnimationSelection(animationSelection,width,height), mask = makeMask(), fill = makeMask();
  const mc = mask.getContext('2d'), fc = fill.getContext('2d'), maskImage = mc.createImageData(width,height), fillImage = fc.createImageData(width,height), edges = [];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const index = y * width + x;
    if (!alpha[index]) continue;
    const pixel = index * 4;
    maskImage.data[pixel] = maskImage.data[pixel+1] = maskImage.data[pixel+2] = 255;
    maskImage.data[pixel+3] = alpha[index];
    fillImage.data[pixel] = 112; fillImage.data[pixel+1] = 205; fillImage.data[pixel+2] = 248;
    fillImage.data[pixel+3] = Math.round(31 * alpha[index] / 255);
    if (!y || !alpha[index-width]) edges.push([x,y,x+1,y]);
    if (y === height-1 || !alpha[index+width]) edges.push([x,y+1,x+1,y+1]);
    if (!x || !alpha[index-1]) edges.push([x,y,x,y+1]);
    if (x === width-1 || !alpha[index+1]) edges.push([x+1,y,x+1,y+1]);
  }
  mc.putImageData(maskImage,0,0); fc.putImageData(fillImage,0,0);
  animationSelectionRasterCache = {key,selection:animationSelection,alpha,mask,fill,edges};
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
function selectAnimationLayer(id, {toggle=false,range=false} = {}) {
  const layer=animationLayerList().find(layer=>layer.id===id);
  if (!layer) return;
  const selected=selectedAnimationLayerIds();
  if (range) {
    const visible=animationVisibleLayers().map(layer=>layer.id), anchor=visible.indexOf(state.animationSelectionAnchorId || state.activeAnimationLayerId), at=visible.indexOf(id);
    const ids=visible.slice(Math.min(anchor<0?at:anchor,at),Math.max(anchor<0?at:anchor,at)+1);
    state.selectedAnimationLayerIds=toggle ? [...new Set([...selected,...ids])] : ids;
  } else if (toggle) state.selectedAnimationLayerIds=selected.includes(id) ? selected.filter(item=>item!==id) : [...selected,id];
  else state.selectedAnimationLayerIds=[id];
  if (!state.selectedAnimationLayerIds.length) state.selectedAnimationLayerIds=[id];
  state.activeAnimationLayerId=state.selectedAnimationLayerIds.includes(id) ? id : state.selectedAnimationLayerIds.at(-1);
  if (!range) state.animationSelectionAnchorId=id;
  if (activeAnimationLayer()?.group && !['move','dropper'].includes(state.animationTool)) state.animationTool='move';
  drawFrame(state.currentFrame); updateInfo();
}
function setAnimationOffset(id, axis, value, history = true) {
  const layer = animationLayerList().find(layer => layer.id === id), offset=animationLayerOffset(layer);
  if (!offset) return;
  const next = Math.round(Number(value) || 0), delta=next-offset[axis];
  if (!delta) return;
  if (history) pushHistory();
  animationMovementTargets(layer).forEach(item=>{
    const cel=animationCel(item);writeAnimationOffset(item,state.currentFrame,cel.offsetX+(axis==='x'?delta:0),cel.offsetY+(axis==='y'?delta:0));
  });
  state.activeAnimationLayerId = id;
  animationSelection = null;
  animationChanged(false);
}
function toggleAnimationFlip(id, axis) {
  const layer = animationLayerList().find(layer => layer.id === id), targets=animationMovementTargets(layer);
  if (!targets.length) return;
  pushHistory();
  const groupBounds=layer.group ? animationGroupBounds(layer) : null;
  const records=targets.map(item=>({layer:item,cel:animationCel(item),bounds:groupBounds?animationLayerBounds(item):null}));
  records.forEach(record=>{
    const item=record.layer,cel=record.cel;
    if (groupBounds) {
      const delta=axis==='x' ? groupBounds.left+groupBounds.right-record.bounds.left-record.bounds.right : groupBounds.top+groupBounds.bottom-record.bounds.top-record.bounds.bottom;
      writeAnimationOffset(item,state.currentFrame,cel.offsetX+(axis==='x'?delta:0),cel.offsetY+(axis==='y'?delta:0));
    }
    if (animationLayerUsesBaseFrame(item)) {const flips=axis==='x'?state.frameFlips:state.frameFlipYs;flips[state.currentFrame]=!flips[state.currentFrame];}
    else cel[axis==='x'?'flipX':'flipY']=!cel[axis==='x'?'flipX':'flipY'];
  });
  state.activeAnimationLayerId = id; animationSelection = null; animationChanged();
}
function removeAnimationLayer(id) {
  if (!animationLayerList().some(layer => layer.id === id)) return;
  pushHistory();
  const layers = ensureAnimationLayers(), at = layers.findIndex(layer => layer.id === id), removed=animationSubtreeIds(id,layers);
  state.animationLayers=layers.filter(layer=>!removed.has(layer.id));
  state.frames.forEach(frame => {
    removed.forEach(removedId=>{
      if (frame.animationCels) delete frame.animationCels[removedId];
      if (frame.animationVisibility) delete frame.animationVisibility[removedId];
    });
  });
  state.activeAnimationLayerId = state.animationLayers[Math.min(at,state.animationLayers.length-1)]?.id || '';
  state.selectedAnimationLayerIds=state.activeAnimationLayerId?[state.activeAnimationLayerId]:[];
  animationSelection = null; animationChanged();
}
function renameAnimationLayer(id, name) {
  const layer = animationLayerList().find(layer => layer.id === id), next = name.trim();
  if (!layer || !next || next === layer.name) { updateAnimationUi(true); return; }
  pushHistory();
  ensureAnimationLayers().find(item => item.id === id).name = next;
  updateAnimationUi(true);
}
function moveAnimationLayer(id, targetId, after, intoGroup = false) {
  const layers = animationLayerList(), from = layers.findIndex(layer => layer.id === id);
  const target=layers.find(layer=>layer.id===targetId), moving=animationSubtreeIds(id,layers);
  if (from < 0 || !target || moving.has(targetId) || (intoGroup&&!target.group)) return;
  const members=layers.filter(layer=>moving.has(layer.id)),next=layers.filter(layer=>!moving.has(layer.id));
  const targetSubtree=animationSubtreeIds(targetId,next);
  let index=next.findIndex(layer=>layer.id===targetId)+(intoGroup?1:after?targetSubtree.size:0);
  const parentId=intoGroup?targetId:(target.parentId||'');
  if ((members[0].parentId||'')===parentId && index===from && !intoGroup) return;
  pushHistory();members[0].parentId=parentId;
  if(intoGroup)target.collapsed=false;
  next.splice(index,0,...members);
  state.animationLayers=next;state.activeAnimationLayerId=id;state.selectedAnimationLayerIds=[id];animationChanged();
}
function updateAnimationUi(force = false) {
  const layers = animationLayerList(), active = activeAnimationLayer(), visibleLayers=animationVisibleLayers(), selectedIds=new Set(selectedAnimationLayerIds());
  animationEls.copy.disabled=!hasFrames() || !selectedIds.size;
  animationEls.paste.disabled=!hasFrames() || !animationClipboard?.records.length;
  animationEls.newLayer.disabled=!hasFrames();
  animationEls.newGroup.disabled=!hasFrames() || !selectedIds.size;
  animationEls.merge.disabled=!hasFrames() || (selectedIds.size<2 && !layers.some(layer=>selectedIds.has(layer.id) && layer.group));
  animationEls.exportLayer.disabled = !hasFrames() || !animationLayerVisible(active);
  animationEls.merge.title='Merge selected layers or flatten a selected group across its frames';
  animationEls.newGroup.title='Group selected layers (Ctrl/Cmd-click or Shift-click layer names to select several)';
  if (!validAnimationSelection()) animationSelection = null;
  const selected = !!animationSelection;
  animationEls.split.disabled = !selected || active?.group || !animationLayerVisible(active);
  animationEls.selectionActions.hidden = !selected;
  const builder = animationBuilderCompanionActive();
  const builderReady = builder && spriteSheetBuilderEditingAvailable();
  const tool = builder ? spriteSheetBuilderPaintTool() : state.animationTool || 'move';
  const selectionButton = animationEls.selectionButton;
  const selectionTool = ANIMATION_SELECTION_TOOLS[tool];
  if (selectionTool && selectionButton.dataset.animationTool !== tool) {
    const { label, icon } = selectionTool;
    selectionButton.dataset.animationTool = tool;
    selectionButton.querySelector('img').src = `icons/${icon}`;
    selectionButton.title = `${label}. Hold to change selection tool.`;
    selectionButton.setAttribute('aria-label', label);
  }
  animationEls.group.querySelectorAll('[data-animation-tool]').forEach(button => {
    const buttonTool = button.dataset.animationTool;
    const on = buttonTool === tool;
    button.classList.toggle('active',on); button.setAttribute('aria-pressed',String(on));
    if (buttonTool === 'brush') button.hidden = !builder;
    const selection = ANIMATION_SELECTION_TOOLS[buttonTool];
    const paintTool = ['pencil', 'eraser', 'bucket'].includes(buttonTool) || selection;
    button.disabled = builder ? !builderReady || !!selection : !hasFrames() || (!active && buttonTool !== 'dropper') || (active?.group && paintTool);
  });
  animationEls.sizeField.hidden = !['pencil', 'eraser', 'brush'].includes(tool);
  const size = builder ? state.brushSize : state.animationBrushSize || 1;
  animationEls.size.value = size;
  animationEls.sizeValue.textContent = size;
  animationEls.wandSettings.hidden = tool !== 'wand';
  const wand = animationWandSettings();
  animationEls.wandAntialias.checked = wand.antialias;
  animationEls.wandContiguous.checked = wand.contiguous;
  if (document.activeElement !== animationEls.wandTolerance) animationEls.wandTolerance.value = wand.tolerance;
  // Update controls in place while typing or scrubbing their numeric values.
  const signature = JSON.stringify([layers.map(layer => [layer.id,layer.name,layer.visible,layer.group,layer.parentId,layer.collapsed]),visibleLayers.map(layer=>layer.id)]);
  const list = animationEls.list;
  if (force || list.dataset.layerKey !== signature) {
    list.dataset.layerKey = signature; list.replaceChildren();
    visibleLayers.forEach(layer => {
      const item = document.createElement('div'); item.className = `reference-layer-item animation-layer-item${layer.group?' animation-group-item':''}`; item.dataset.animationId = layer.id;
      item.style.setProperty('--animation-layer-depth',animationAncestors(layer,layers).length);
      const actions = document.createElement('div'); actions.className = 'animation-layer-actions';
      const heading = document.createElement('div'); heading.className = 'animation-layer-heading';
      const name = document.createElement('button'); name.type = 'button'; name.className = 'reference-layer-name animation-layer-name secondary';
      if(layer.group) {const arrow=document.createElement('span');arrow.className='animation-group-arrow';arrow.textContent=layer.collapsed?'▸':'▾';arrow.setAttribute('aria-hidden','true');name.append(arrow);name.setAttribute('aria-expanded',String(!layer.collapsed));}
      name.append(layer.name);
      name.title = layer.group ? 'Double-click to expand/collapse; Ctrl/Cmd-click to select multiple; F2 to rename' : 'Drag to reorder; double-click to rename; Ctrl/Cmd-click or Shift-click to select multiple';
      name.setAttribute('aria-label', `Select ${layer.name}`);
      heading.append(name);
      if (!layer.group) {
        const allFrames = document.createElement('button');
        allFrames.type = 'button';
        allFrames.className = 'secondary reference-flip-button';
        allFrames.dataset.animationAction = 'all-frames';
        allFrames.innerHTML = `<svg class="lock-icon" viewBox="0 0 24 24" aria-hidden="true">${ICON_LOOP}</svg>`;
        heading.append(allFrames);
      }
      const eye = document.createElement('button'); eye.type = 'button'; eye.className = 'lock-button reference-visibility-button'; eye.dataset.animationAction = 'visible';
      eye.innerHTML = '<svg class="lock-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'lock-button reference-remove-button'; remove.dataset.animationAction = 'remove'; remove.setAttribute('aria-label',`Remove ${layer.name}`); remove.title = 'Remove Layer';
      if(layer.group)remove.title='Remove group and its layers';
      remove.innerHTML = '<svg class="lock-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"></path></svg>';
      actions.append(eye,remove);
      const controls = document.createElement('div'); controls.className = 'reference-layer-controls animation-layer-controls';
      const flips = document.createElement('div'); flips.className = 'animation-layer-flips';
      ['x','y'].forEach(axis => {
        const label = document.createElement('label'); label.className = 'animation-offset-field'; label.append(axis.toUpperCase());
        const input = document.createElement('input'); input.type = 'number'; input.step = '1'; input.className = 'reference-offset-input'; input.dataset.animationOffset = axis; input.setAttribute('aria-label',`Offset ${axis.toUpperCase()} for ${layer.name}`);
        label.append(input); controls.append(label);
      });
      const opacityField = document.createElement('label');
      opacityField.className = 'animation-offset-field';
      opacityField.append('O');
      const opacity = document.createElement('input');
      opacity.type = 'number'; opacity.min = '0'; opacity.max = '100'; opacity.step = '1';
      opacity.className = 'reference-offset-input'; opacity.dataset.animationOpacity = '';
      opacity.title = 'Layer opacity (0–100%)';
      opacity.setAttribute('aria-label', `Opacity (%) for ${layer.name}`);
      opacityField.append(opacity); controls.append(opacityField);
      ['x','y'].forEach(axis => {
        const flip = document.createElement('button'); flip.type = 'button'; flip.className = 'secondary reference-flip-button'; flip.dataset.animationFlip = axis;
        const label = axis === 'x' ? 'Flip horizontal' : 'Flip vertical'; flip.title = label; flip.setAttribute('aria-label',`${label} for ${layer.name}`);
        const icon = document.createElement('img'); icon.className = 'tool-icon-image'; icon.alt = ''; icon.src = `icons/flip-${axis === 'x' ? 'horizontal' : 'vertical'}.svg`; flip.append(icon); flips.append(flip);
      });
      item.append(actions,heading,controls,flips); list.append(item);
    });
  }
  visibleLayers.forEach(layer => {
    const item = [...list.children].find(el => el.dataset.animationId === layer.id); if (!item) return;
    const cel = animationCel(layer), offset=animationLayerOffset(layer); item.classList.toggle('active',selectedIds.has(layer.id));
    const visible = animationLayerOwnVisible(layer);
    item.classList.toggle('animation-inherited-hidden',visible&&!animationLayerVisible(layer));
    const allFrames = item.querySelector('[data-animation-action="all-frames"]');
    if (allFrames) {
      allFrames.classList.toggle('active', !!layer.sharedCel);
      allFrames.setAttribute('aria-pressed', String(!!layer.sharedCel));
      allFrames.setAttribute('aria-label', `Render ${layer.name} in all frames`);
      allFrames.title = layer.sharedCel ? 'Restore per-frame artwork' : 'Render this artwork in all frames';
    }
    const eye = item.querySelector('[data-animation-action="visible"]'); eye.classList.toggle('active',visible); eye.setAttribute('aria-pressed',String(visible)); eye.setAttribute('aria-label',`${visible ? 'Hide' : 'Show'} ${layer.name}`); eye.title = `${visible ? 'Hide' : 'Show'} ${layer.group?'group':'sprite'} in current frame`;
    item.querySelectorAll('[data-animation-offset]').forEach(input => { if (document.activeElement !== input || input.hasAttribute('data-numeric-committing')) input.value = Math.round(offset?.[input.dataset.animationOffset] || 0); input.disabled = !offset; });
    const opacity = item.querySelector('[data-animation-opacity]');
    if (state.restoring || document.activeElement !== opacity || opacity.hasAttribute('data-numeric-committing')) opacity.value = normalizeAnimationOpacity(layer.opacity);
    item.querySelectorAll('[data-animation-flip]').forEach(button => { const flip = !!cel?.[button.dataset.animationFlip === 'x' ? 'flipX' : 'flipY']; button.classList.toggle('active',flip); if(layer.group)button.removeAttribute('aria-pressed');else button.setAttribute('aria-pressed',String(flip)); button.disabled = !offset; });
  });
  const colorsEnabled = builder ? builderReady : hasFrames();
  const colorKey = JSON.stringify([state.pencilColors,state.activePencilColorIndex,colorsEnabled]);
  if (animationEls.colors.dataset.colorKey !== colorKey) {
    animationEls.colors.dataset.colorKey = colorKey; animationEls.colors.replaceChildren();
    (state.pencilColors || [state.pencilColor]).forEach((color,index) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'swatch-button pencil-color-button'; button.dataset.animationColor = index; button.disabled = !colorsEnabled; button.setAttribute('aria-label',`Pencil color ${index+1}`); button.classList.toggle('active',index === state.activePencilColorIndex); button.setAttribute('aria-pressed',String(index === state.activePencilColorIndex));
      const chip = document.createElement('span'); chip.className = 'swatch-chip'; const background = pencilColorSwatchBackground(color); chip.style.backgroundImage = background.image; chip.style.backgroundSize = background.size; chip.style.backgroundPosition = background.position; button.append(chip); animationEls.colors.append(button);
    });
  }
}
function validateAnimationSheetGrid(canvas, rows, cols) {
  if (canvas.width < cols || canvas.height < rows) throw new Error('Rows and columns must leave at least one pixel in every frame.');
}
function extendAnimationTimeline(count, kind) {
  while (state.frames.length < count) {
    const i = state.frames.length - 1, frame = cloneFrameRecord(state.frames[i]);
    frame.kind = kind;
    state.frames.push(frame);
    state.frameOffsets.push({ ...(state.frameOffsets[i] || { x: 0, y: 0 }) });
    state.frameMasks.push(canvasClone(state.frameMasks[i] || makeMask()));
    state.maskDirty.push(!!state.maskDirty[i]);
    state.indexedFrames.push(null);
    state.frameScales.push({ ...frameScaleMultiplier(i) });
    state.frameFlips.push(frameFlipX(i));
    state.frameFlipYs.push(frameFlipY(i));
  }
}
function writeAnimationImportCels(layer, slices) {
  state.frames.forEach((frame, i) => {
    frame.animationCels ||= {};
    const previous = frame.animationCels[layer.id];
    frame.animationCels[layer.id] = {
      canvas: canvasClone(slices[i % slices.length].canvas),
      ...animationCelTransform(previous || {})
    };
  });
}
function resliceAnimationGrid(rows, cols) {
  if (!hasFrames() || !Array.isArray(state.animationLayers)) return false;
  const oldFrames = state.frames, sheets = sheetSources();
  const legacy = rows * cols > 1 && oldFrames.length === 1 ? oldFrames[0] : null;
  const legacyBase = legacy?.kind === 'image' && !sheets.length
    && state.animationLayers.some(layer => layer.base && layer.name === state.imageName && !layer.sharedCel);
  const overlays = state.animationLayers.flatMap(layer => {
    // Older one-frame imports stored the whole sheet as a single cel.
    const source = layer.sheetCanvas || (legacy && !layer.sourceFrameCount && /^animation-\d+-/.test(layer.id) && legacy.animationCels?.[layer.id]?.canvas);
    return source ? [{ layer, source }] : [];
  });
  if (!sheets.length && !legacyBase && !overlays.length) return false;
  const sameGrid = rows === state.rows && cols === state.cols;
  if (sameGrid && !legacyBase && !overlays.some(({ layer }) => !layer.sheetCanvas)) return true;
  const sources = legacyBase ? [{ image: legacy.sourceCanvas || legacy.canvas, name: state.imageName }] : sheets;
  try {
    for (const { image } of sources) validateAnimationSheetGrid(image, rows, cols);
    for (const { source } of overlays) validateAnimationSheetGrid(source, rows, cols);
  } catch (error) {
    els.rowsInput.value = state.rows;
    els.colsInput.value = state.cols;
    showError(error.message);
    return true;
  }
  const slices = overlays.map(({ layer, source }) => applyImportFrameSkip(createSheetFrames(source, rows, cols, layer.name)));
  const sheetFrames = sources.flatMap(({ image, name }, index) => createSheetFrames(image, rows, cols, name, index));
  pause(false, { updateInfo: false });
  pushHistory();
  state.rows = rows; state.cols = cols;
  state.sheetImages = sources; state.sheetImage = sources[0]?.image || null;
  const padding = oldFrames.filter(frame => frame.kind === ANIMATION_GRID_PADDING);
  const oldSheetFrames = legacyBase ? [legacy] : oldFrames.filter(frame => frame.kind === 'sheet');
  const previousSheetFrames = [...oldSheetFrames, ...padding];
  const rebuilt = applyImportFrameSkip(sheetFrames).map((frame, i) => ({
    ...frame,
    animationCels: { ...previousSheetFrames[i]?.animationCels },
    animationVisibility: cloneAnimationVisibility(previousSheetFrames[i]?.animationVisibility)
  }));
  const animatedFrames = Math.min(oldFrames.length, Math.max(0, ...state.animationLayers.map(layer => layer.sourceFrameCount || 0)));
  const minFrames = Math.max(1, animatedFrames, ...slices.map(frames => frames.length));
  const retained = oldFrames.filter(frame => frame.kind !== 'sheet' && frame !== (legacyBase ? legacy : null) && frame.kind !== ANIMATION_GRID_PADDING);
  // Reuse generated records when the new grid still needs those timeline slots.
  const paddingUsed = Math.max(0, rebuilt.length - oldSheetFrames.length);
  const paddingNeeded = Math.max(0, minFrames - rebuilt.length - retained.length);
  state.frames = [...rebuilt, ...retained, ...padding.slice(paddingUsed, paddingUsed + paddingNeeded)];
  const originalIndices = new Map(oldFrames.map((frame, i) => [frame, i]));
  for (const key of ['frameOffsets', 'frameMasks', 'maskDirty', 'indexedFrames', 'frameScales', 'frameFlips', 'frameFlipYs']) {
    const previous = state[key];
    state[key] = state.frames.map(frame => previous[originalIndices.get(frame)]);
  }
  extendAnimationTimeline(minFrames, ANIMATION_GRID_PADDING);
  overlays.forEach(({ layer, source }, i) => {
    layer.sheetCanvas = source;
    writeAnimationImportCels(layer, slices[i]);
  });
  if (rebuilt.length) state.cageCustom = false;
  state.truePixelPreviewVisible = false;
  showError('');
  resetAnimationTools();
  markFrameBitmapsDirty();
  syncAfterDataChange(true);
  return true;
}
async function loadAnimationSprites(files) {
  const accepted = displayReferenceFileList(files); if (!accepted.length) return;
  try {
    showError('');
    // Decode before committing, so an invalid file leaves the current project intact.
    const sprites = [];
    for (const file of accepted) {
      sprites.push(await createDisplayReferenceLayerFromFile(file,{ id: `animation-${Date.now()}-${Math.random().toString(36).slice(2)}` }));
    }
    const { rows, cols } = state;
    for (const sprite of sprites) {
      if (!sprite.frames.length) validateAnimationSheetGrid(sprite.canvas, rows, cols);
    }
    pause(true, { updateInfo: false }); pushHistory();
    for (const sprite of sprites) {
      const sheet = !sprite.frames.length;
      const frames = sheet ? applyImportFrameSkip(createSheetFrames(sprite.canvas, rows, cols, sprite.name)) : sprite.frames;
      if (!hasFrames()) {
        state.frames = sheet ? frames : frames.map(({ canvas },i) => ({ kind:'image', id:`image-${Date.now()}-${state.importedId++}`, name:`${sprite.name} ${i+1}`, canvas:canvasClone(canvas), sourceCanvas:canvasClone(canvas) }));
        state.imageName = sprite.name;
        state.sheetImage = sheet ? sprite.canvas : null;
        state.sheetImages = sheet ? [{ image: sprite.canvas, name: sprite.name }] : [];
        state.frameOffsets = []; state.frameMasks = []; state.maskDirty = []; state.indexedFrames = []; state.frameScales = []; state.frameFlips = []; state.frameFlipYs = [];
        state.scaleX = 1; state.scaleY = 1; state.offsetXAll = 0; state.offsetYAll = 0;
        state.cageCustom = false; state.currentFrame = 0; state.selectedFrameIndices = [0]; state.selectionAnchorFrame = 0;
        state.animationLayers = [{ id:ANIMATION_BASE_ID, name:sprite.name, visible:true, base:true }];
        state.activeAnimationLayerId = ANIMATION_BASE_ID;
        if (!sprites.some(item => !item.frames.length)) autoFitGridToFrameCount();
        updateMetrics();
        state.pivotX = defaultPivotX(); state.pivotY = state.cageHeight;
      } else {
        const layers = ensureAnimationLayers();
        extendAnimationTimeline(frames.length, sheet ? ANIMATION_GRID_PADDING : 'image');
        const layer = { id:sprite.id,name:sprite.name,visible:true,base:false };
        if (sheet) layer.sheetCanvas = sprite.canvas;
        else layer.sourceFrameCount = frames.length;
        layers.unshift(layer);
        writeAnimationImportCels(layer, frames);
        state.activeAnimationLayerId = layer.id;
      }
    }
    resetAnimationTools(); markFrameBitmapsDirty(); syncAfterDataChange(true, { deferHiddenPalette: true });
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
function eraseAnimationSelection() {
  const layer=activeAnimationLayer(), raster=animationSelectionRaster();
  if (!layer || layer.group || !animationLayerVisible(layer) || !animationCel(layer) || !raster?.alpha.some(value=>value)) return false;
  pause();pushHistory();
  const base = animationLayerUsesBaseFrame(layer);
  if(base)animationBakeBase(state.currentFrame);
  const cel=animationCel(layer), mask=base?raster.mask:animationLocalMask(raster.mask,cel), t=cel.canvas.getContext('2d');
  t.save();t.imageSmoothingEnabled=false;t.globalCompositeOperation='destination-out';t.drawImage(mask,0,0);t.restore();
  if(base)state.frames[state.currentFrame].sourceCanvas=canvasClone(cel.canvas);
  if(!layer.sharedCel)state.indexedFrames[state.currentFrame]=null;
  animationChanged();return true;
}
function animationBakeCel(layer, i) {
  const cel = animationCel(layer, i), canvas = makeMask();
  drawAnimationCel(canvas.getContext('2d'), cel);
  cel.canvas = canvas; cel.offsetX = 0; cel.offsetY = 0; cel.flipX = false; cel.flipY = false;
  delete cel.mask;
}
function splitAnimationSelection() {
  const layer = activeAnimationLayer(), mask = animationSelectionMask();
  if (!animationLayerVisible(layer) || !mask || !animationCel(layer)) return;
  const source = makeMask(), t = source.getContext('2d');
  const base = animationLayerUsesBaseFrame(layer);
  if (base) drawBaseSprite(t,state.currentFrame,0,0,{applyMask:true});
  else drawAnimationCel(t,animationCel(layer));
  t.globalCompositeOperation = 'destination-in'; t.drawImage(mask,0,0); t.globalCompositeOperation = 'source-over';
  const pixels = t.getImageData(0,0,source.width,source.height); let left=source.width,top=source.height,right=-1,bottom=-1;
  for (let y=0;y<source.height;y++) for (let x=0;x<source.width;x++) if(pixels.data[(y*source.width+x)*4+3]) {left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
  if (right < left) { showError('Select some visible pixels on the active sprite before splitting.'); return; }
  pushHistory();
  const target = base ? {canvas:animationBakeBase(state.currentFrame),offsetX:0,offsetY:0,flipX:false,flipY:false} : animationCel(layer);
  const cut = base ? mask : animationLocalMask(mask,target), targetContext = target.canvas.getContext('2d');
  targetContext.save(); targetContext.globalCompositeOperation='destination-out'; targetContext.drawImage(cut,0,0); targetContext.restore();
  if(base) state.frames[state.currentFrame].sourceCanvas = canvasClone(target.canvas);
  const cropped = makeMask(right-left+1,bottom-top+1); cropped.getContext('2d').drawImage(source,left,top,cropped.width,cropped.height,0,0,cropped.width,cropped.height);
  const id=`animation-${Date.now()}-${Math.random().toString(36).slice(2)}`, layers=ensureAnimationLayers(), index=layers.findIndex(item=>item.id===layer.id);
  const splitLayer = {id,name:`${layer.name} split`,visible:true,base:false,parentId:layer.parentId || '',opacity:layer.opacity};
  layers.splice(index,0,splitLayer);
  const frame=state.frames[state.currentFrame]; frame.animationCels ||= {};
  const splitCel = {canvas:cropped,offsetX:left-Math.round((state.cageWidth-cropped.width)/2),offsetY:top-Math.round((state.cageHeight-cropped.height)/2),flipX:false,flipY:false};
  frame.animationCels[id] = splitCel;
  if (layer.sharedCel) {
    splitLayer.sharedCel = cloneAnimationCel(splitCel);
    splitLayer.visible = layer.visible;
    for (const item of state.frames) {
      const visible = item.animationVisibility?.[layer.id];
      if (typeof visible === 'boolean') item.animationVisibility[id] = visible;
    }
  }
  state.activeAnimationLayerId=id;state.selectedAnimationLayerIds=[id]; animationSelection=null; state.animationTool='move'; showError(''); animationChanged();
}
function setAnimationTool(tool) {
  if (animationBuilderCompanionActive()) {
    setSpriteSheetBuilderPaintTool(tool);
    return;
  }
  if (activeAnimationLayer()?.group && (['pencil', 'eraser', 'bucket'].includes(tool) || ANIMATION_SELECTION_TOOLS[tool])) return;
  const previous = state.animationTool;
  const selection = animationSelection;
  clearActiveCanvasTools(false);
  state.animationTool = previous === tool && tool !== 'move' ? 'move' : tool;
  animationSelection = selection;
  drawFrame(state.currentFrame); updateInfo();
}
function animationPoint(e) {
  const p=pointerGuidePoint(e);
  return {x:clamp(Math.round(p.x),0,state.cageWidth),y:clamp(Math.round(p.y),0,state.cageHeight)};
}
function animationPaintPixelCenter(point) {
  const x = Math.floor(point.x), y = Math.floor(point.y);
  if (x < 0 || x >= state.cageWidth || y < 0 || y >= state.cageHeight) return null;
  return { x: x + .5, y: y + .5 };
}
function animationPaintLineAnchor(layer, tool, frameIndex = state.currentFrame) {
  const anchor = animationPaintAnchor;
  if (!anchor || anchor.frameId !== state.frames[frameIndex]?.id || anchor.layerId !== layer?.id || anchor.tool !== tool) return null;
  return animationPaintPixelCenter(anchor.point);
}
function setAnimationPaintShiftHeld(held, redraw = true) {
  if (animationPaintShiftHeld === held) return;
  animationPaintShiftHeld = held;
  if (redraw && state.brushCursorVisible && animationPixelBrushActive()) renderBrushCursorOverlay();
}
function animationLayerAtPixel(x, y, i = state.currentFrame) {
  for (const layer of animationFrameLayers(i)) {
    if (layer.group || !animationLayerVisible(layer, i) || !animationEffectiveOpacity(layer)) continue;
    if (animationLayerUsesBaseFrame(layer)) {
      const pixel = makeMask(1, 1).getContext('2d');
      drawBaseSprite(pixel, i, -x, -y, { applyMask: true });
      if (pixel.getImageData(0, 0, 1, 1).data[3]) return layer;
      continue;
    }
    const cel = animationCel(layer, i), point = animationCelPixel(cel, x, y);
    if (point.x < 0 || point.y < 0 || point.x >= cel.canvas.width || point.y >= cel.canvas.height) continue;
    const pixels = maskedAnimationCelCanvas(cel).getContext('2d');
    if (pixels.getImageData(point.x, point.y, 1, 1).data[3]) return layer;
  }
  return null;
}
function selectAnimationWandRegion(layer, point, e) {
  const i = state.currentFrame;
  if (!animationLayerVisible(layer, i) || !animationCel(layer, i)) return;
  const canvas = makeMask(), { width, height } = canvas, context = canvas.getContext('2d');
  if (animationLayerUsesBaseFrame(layer)) drawBaseSprite(context, i, 0, 0, { applyMask: true });
  else drawAnimationCel(context, animationCel(layer, i));
  const previous = animationSelectionRaster()?.alpha;
  if (e.altKey && !previous) return;
  let alpha = magicWandAlpha(context.getImageData(0, 0, width, height), point.x, point.y, animationWandSettings());
  if (previous && (e.altKey || e.shiftKey)) {
    alpha = previous.map((value, index) => e.altKey ? Math.min(value, 255 - alpha[index]) : Math.max(value, alpha[index]));
  }
  const next = alpha.some(Boolean) ? { kind: 'mask', alpha, width, height, frameId: state.frames[i].id } : null;
  commitAnimationSelection(next);
  renderAnimationSelectionOverlay();
  updateAnimationUi();
}
function paintAnimationBucket(layer, point, i = state.currentFrame) {
  const cel = animationCel(layer, i);
  if (!cel || !animationLayerVisible(layer, i)) return false;
  const base = animationLayerUsesBaseFrame(layer), { canvas } = cel, { width, height } = canvas;
  const pixel = base ? framePixelPoint(i, point.x, point.y) : animationCelPixel(cel, point.x, point.y);
  if (!pixel || pixel.x < 0 || pixel.y < 0 || pixel.x >= width || pixel.y >= height) return false;
  const context = canvas.getContext('2d'), image = context.getImageData(0, 0, width, height);
  const { r, g, b, a } = cloneColor(state.pencilColor), color = a ? [r, g, b, a] : [0, 0, 0, 0];
  const seed = (pixel.y * width + pixel.x) * 4;
  if (color.every((value, channel) => image.data[seed + channel] === value)) return false;
  const mask = animationSelectionMask();
  let canVisit = null;
  if (mask) {
    const local = base ? makeMask(width, height) : animationLocalMask(mask, cel);
    const localContext = local.getContext('2d');
    if (base) drawCageLayerIntoSource(localContext, mask, i);
    const selected = localContext.getImageData(0, 0, width, height).data;
    canVisit = id => selected[id * 4 + 3] > 0;
  }
  const region = magicWandAlpha(image, pixel.x, pixel.y, { contiguous: true, tolerance: 0 }, canVisit);
  if (!region.some(Boolean)) return false;
  const fill = pixels => {
    for (let id = 0; id < region.length; id++) {
      if (region[id]) pixels.data.set(color, id * 4);
    }
  };
  pushHistory();
  fill(image);
  context.putImageData(image, 0, 0);
  if (base) {
    const frame = state.frames[i], source = frame.sourceCanvas;
    if (source && source !== canvas && source.width === width && source.height === height) {
      const sourceContext = source.getContext('2d'), original = sourceContext.getImageData(0, 0, width, height);
      fill(original);
      sourceContext.putImageData(original, 0, 0);
    } else frame.sourceCanvas = canvasClone(canvas);
  }
  if (!layer.sharedCel) state.indexedFrames[i] = null;
  markFrameBitmapsDirty();
  if (layer.sharedCel || !updateFrameThumb(i)) buildFilmstrip();
  drawFrame(state.currentFrame);
  updateInfo({ deferHiddenPalette: true });
  return true;
}
function startAnimationCanvasDrag(e) {
  if(!animationPanelActive() || !hasFrames()) return false;
  if (temporaryPencilColorPickerActive(e)) {
    pickPencilColorFromCanvasEvent(e);
    return true;
  }
  if (e.ctrlKey || e.metaKey) {
    const point = pointerCagePoint(e);
    const picked = point && animationLayerAtPixel(point.x, point.y);
    if (picked) {
      pause(false, { updateInfo: false });
      animationAncestors(picked).forEach(group => { group.collapsed = false; });
      selectAnimationLayer(picked.id);
    }
    return true;
  }
  const layer=activeAnimationLayer(), tool=state.animationTool || 'move';
  if(tool==='move' && (rulerHit(e) || pivotHit(e))) return false;
  if(tool==='dropper') {
    hideBrushCursor(false);
    const p=pointerCagePoint(e); if(p) {const color=sampleVisibleFrameColor(state.currentFrame,p.x,p.y,{allowTransparent:true});if(color)setPencilColorAt(state.activePencilColorIndex,color,{refresh:false});}
    if(tool==='dropper'&&!layer?.group)state.animationTool='pencil'; updateInfo(); return true;
  }
  if (tool === 'wand' || tool === 'bucket') {
    const point = pointerCagePoint(e), i = state.currentFrame;
    if (point && layer) {
      pause(false, { updateInfo: false });
      if (tool === 'wand') selectAnimationWandRegion(layer, point, e);
      else paintAnimationBucket(layer, point, i);
    }
    return true;
  }
  if(!animationLayerVisible(layer) || !animationLayerOffset(layer) || (layer.group && tool!=='move')) return true;
  const painting=tool==='pencil'||tool==='eraser';
  pause(false,{updateInfo:!painting});
  let previousSelection=validAnimationSelection()?animationSelection:null,selectionMove=false;
  if(tool==='rectangle'||tool==='lasso') {
    if(e.altKey && !previousSelection)return true;
    selectionMove=!e.altKey && !e.shiftKey && animationSelectionContainsPoint(e);
    if(!selectionMove) {
      const p=animationPoint(e);animationSelection={kind:tool,points:[p,p],frameId:state.frames[state.currentFrame].id,
        subtractFrom:e.altKey?rasterizeAnimationSelection(previousSelection,state.cageWidth,state.cageHeight):null,
        addTo:!e.altKey && e.shiftKey && previousSelection?rasterizeAnimationSelection(previousSelection,state.cageWidth,state.cageHeight):null};
    }
  } else {
    pushHistory();
    if(painting) {
      if(animationLayerUsesBaseFrame(layer))animationBakeBase(state.currentFrame);
      else animationBakeCel(layer,state.currentFrame);
    }
  }
  const offset=animationLayerOffset(layer),targets=tool==='move'?animationMovementTargets(layer).map(item=>({id:item.id,x:animationCel(item).offsetX,y:animationCel(item).offsetY})):[];
  animationStroke={layerId:layer.id,frame:state.currentFrame,tool,last:pointerGuidePoint(e),startX:e.clientX,startY:e.clientY,offsetX:offset.x,offsetY:offset.y,targets,previousSelection,selectionMove};
  state.activeAnimationLayerId=layer.id;state.dragging=true;state.dragMode=`animation-${tool}`;state.dragPointerId=e.pointerId;
  els.canvasShell.classList.add('dragging');els.canvasShell.setPointerCapture(e.pointerId);
  els.canvasShell.classList.toggle('animation-selection-moving',selectionMove);
  if(painting) {
    const endpoint = e.shiftKey && animationPaintPixelCenter(animationStroke.last);
    const anchor = endpoint && animationPaintLineAnchor(layer, tool);
    if (anchor) {
      animationStroke.last = anchor;
      animationStroke.points = [endpoint];
      animationStroke.straightLine = true;
    } else animationStroke.points = [animationStroke.last];
    animationStroke.previewFrame=null;
    queueAnimationPaintPreview(animationStroke,e);
  } else drawFrame(state.currentFrame);
  updateAnimationUi();return true;
}
function animationPaintClip() {
  // Paint targets have been baked into cage space. Clip by runs of selected pixels.
  const raster = animationSelectionRaster();
  if (!raster) return null;
  if (raster.paintClip) return raster.paintClip;
  const { alpha } = raster;
  const path=new Path2D(), width=state.cageWidth, height=state.cageHeight;
  for(let y=0;y<height;y++) {
    const row=y*width;
    for(let x=0;x<width;) {
      if(!alpha[row+x]) {x++;continue;}
      const left=x++;
      while(x<width&&alpha[row+x])x++;
      path.rect(left,y,x-left,1);
    }
  }
  raster.paintClip = path;
  return path;
}
function forEachAnimationPaintPixel(start, end, visit) {
  const dx = end.x - start.x, dy = end.y - start.y;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
  for (let step = 0; step <= steps; step++) {
    visit(Math.floor(start.x + dx * step / steps), Math.floor(start.y + dy * step / steps));
  }
}
function renderAnimationPaintLinePreview(t, rect, zoomX, zoomY) {
  if (!animationPaintShiftHeld || state.dragging || !animationPixelBrushActive()) return;
  const layer = activeAnimationLayer();
  if (!animationLayerVisible(layer)) return;
  const tool = state.animationTool;
  const start = animationPaintLineAnchor(layer, tool);
  const end = animationPaintPixelCenter({ x: state.brushX, y: state.brushY });
  if (!start || !end) return;

  const size = Math.max(1, Math.round(state.animationBrushSize || 1));
  const offset = Math.floor(.5 - size / 2);
  const top = Math.max(0, Math.floor(Math.min(start.y, end.y)) + offset);
  const bottom = Math.min(state.cageHeight, Math.floor(Math.max(start.y, end.y)) + offset + size);
  const leftEdges = new Int32Array(bottom - top).fill(state.cageWidth);
  const rightEdges = new Int32Array(bottom - top);
  const insets = tool === 'eraser' ? Array.from({ length: size }, (_, row) => hardPencilRowInset(size, row)) : null;
  // Each row of a straight stroke is a continuous span. Fill the union once to keep the preview opacity even.
  forEachAnimationPaintPixel(start, end, (x, y) => {
    const stampLeft = x + offset, stampTop = y + offset;
    for (let row = Math.max(0, top - stampTop); row < Math.min(size, bottom - stampTop); row++) {
      const index = stampTop + row - top, inset = insets?.[row] ?? 0;
      leftEdges[index] = Math.min(leftEdges[index], stampLeft + inset);
      rightEdges[index] = Math.max(rightEdges[index], stampLeft + size - inset);
    }
  });

  const path = new Path2D();
  for (let index = 0; index < leftEdges.length; index++) {
    const left = Math.max(0, leftEdges[index]), right = Math.min(state.cageWidth, rightEdges[index]);
    if (left < right) path.rect(left, top + index, right - left, 1);
  }
  t.save();
  t.translate(rect.left, rect.top);
  t.scale(zoomX, zoomY);
  const clip = animationPaintClip();
  if (clip) t.clip(clip);
  t.fillStyle = 'rgba(255,255,255,.45)';
  t.fill(path);
  t.restore();
}
function paintAnimationStroke(stroke) {
  const layer=animationLayerList().find(item=>item.id===stroke.layerId),cel=animationCel(layer,stroke.frame);
  if(!cel||!stroke.points.length)return;
  const t=cel.canvas.getContext('2d');
  const size=Math.max(1,Math.round(state.animationBrushSize||1)),eraser=stroke.tool==='eraser';
  const color=eraser?{r:0,g:0,b:0,a:255}:state.pencilColor;
  if(stroke.clip===undefined)stroke.clip=animationPaintClip();
  t.save();
  if(stroke.clip)t.clip(stroke.clip);
  if(eraser)t.globalCompositeOperation='destination-out';
  const stamp = (x, y) => stampHardPencil(t, x + .5, y + .5, size, color, !eraser);
  let a=stroke.last;
  for(const b of stroke.points) {
    forEachAnimationPaintPixel(a, b, stamp);
    a=b;
  }
  t.restore();
  stroke.last=a;stroke.points.length=0;
  if(!layer.sharedCel)state.indexedFrames[stroke.frame]=null;
  markFrameBitmapsDirty();
}
function queueAnimationPaintPreview(stroke,e) {
  stroke.cursorEvent=e;
  if(stroke.previewFrame!==null)return;
  stroke.previewFrame=requestAnimationFrame(()=>{
    stroke.previewFrame=null;
    if(animationStroke!==stroke)return;
    paintAnimationStroke(stroke);
    updateBrushCursorFromEvent(stroke.cursorEvent);
    drawFrame(state.currentFrame,{fast:true,skipThumb:true,animationPaintPreview:true});
  });
}
function moveAnimationCanvasDrag(e) {
  const stroke=animationStroke;if(!stroke)return;
  if(stroke.selectionMove) {
    const d=pointerDelta(e,stroke.startX,stroke.startY);
    animationSelection=translateAnimationSelection(stroke.previousSelection,d.dx,d.dy);
  } else if(stroke.tool==='rectangle'||stroke.tool==='lasso') {
    const p=animationPoint(e);
    if(stroke.tool==='rectangle')animationSelection.points[1]=p;
    else {const last=animationSelection.points[animationSelection.points.length-1];if(Math.hypot(p.x-last.x,p.y-last.y)>=.5)animationSelection.points.push(p);}
  } else if(stroke.tool==='move') {
    const layers=animationLayerList(),d=pointerDelta(e,stroke.startX,stroke.startY);
    stroke.targets.forEach(record=>{const layer=layers.find(item=>item.id===record.id);if(layer)writeAnimationOffset(layer,stroke.frame,record.x+d.dx,record.y+d.dy);});
    animationSelection=null;
  } else if(stroke.tool==='pencil'||stroke.tool==='eraser') {
    if (stroke.straightLine) return;
    stroke.points.push(pointerGuidePoint(e));
    queueAnimationPaintPreview(stroke,e);
    return;
  }
  drawFrame(state.currentFrame,{fast:true,skipThumb:true});updateAnimationUi();
}
function finishAnimationCanvasDrag(e) {
  const stroke=animationStroke;animationStroke=null;
  const painting=stroke && (stroke.tool==='pencil'||stroke.tool==='eraser');
  const layer = painting ? animationLayerList().find(item => item.id === stroke.layerId) : null;
  if(painting) {
    if(stroke.previewFrame!==null) {
      cancelAnimationFrame(stroke.previewFrame);
      paintAnimationStroke(stroke);
      updateBrushCursorFromEvent(stroke.cursorEvent);
    }
    const frame=state.frames[stroke.frame];
    if(animationLayerUsesBaseFrame(layer)&&frame)frame.sourceCanvas=canvasClone(frame.canvas);
    const point = e.type !== 'pointercancel' && animationPaintPixelCenter(stroke.last);
    animationPaintAnchor = point && frame ? { frameId: frame.id, layerId: stroke.layerId, tool: stroke.tool, point } : null;
  }
  state.dragging=false;state.dragMode='offset';state.dragPointerId=null;els.canvasShell.classList.remove('dragging','animation-selection-moving');
  if(els.canvasShell.hasPointerCapture(e.pointerId))els.canvasShell.releasePointerCapture(e.pointerId);
  if(e.type==='pointercancel')animationSelection=stroke?.previousSelection || null;
  else if(stroke && ['lasso','rectangle'].includes(stroke.tool)) {
    let next=animationSelection;
    if(!stroke.selectionMove && next) {
      const alpha=rasterizeAnimationSelection(next,state.cageWidth,state.cageHeight);
      next=alpha.some(value=>value) ? {kind:'mask',alpha,width:state.cageWidth,height:state.cageHeight,offsetX:0,offsetY:0,frameId:next.frameId} : null;
    }
    commitAnimationSelection(next,stroke.previousSelection);
  }
  if(painting) {
    if(layer?.sharedCel || !updateFrameThumb(stroke.frame))buildFilmstrip();
    drawFrame(state.currentFrame);updateInfo({ deferHiddenPalette: true });
  } else if(stroke?.tool==='move')animationChanged();
  else {drawFrame(state.currentFrame);updateAnimationUi();}
}
function handleAnimationKeyDown(e) {
  if(!animationPanelActive()||e.altKey)return false;
  const key=e.key.toLowerCase();
  if ((e.ctrlKey||e.metaKey) && !e.shiftKey && ['c','v'].includes(key)) {
    e.preventDefault();if(!e.repeat)(key==='c'?copyAnimationLayers:pasteAnimationLayers)();return true;
  }
  if(e.ctrlKey||e.metaKey)return false;
  if(ANIMATION_SELECTION_TOOLS[state.animationTool] && ['Delete','Backspace'].includes(e.key)) {
    e.preventDefault();if(!e.repeat)eraseAnimationSelection();return true;
  }
  if(validAnimationSelection() && ANIMATION_SELECTION_TOOLS[state.animationTool] && ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) {
    e.preventDefault();const distance=e.shiftKey?10:1;
    moveAnimationSelection(e.key==='ArrowLeft'?-distance:e.key==='ArrowRight'?distance:0,e.key==='ArrowUp'?-distance:e.key==='ArrowDown'?distance:0);return true;
  }
  if(e.key==='F2'){e.preventDefault();beginAnimationLayerRename(activeAnimationLayer()?.id);return true;}
  if(e.key==='Escape') {commitAnimationSelection(null);state.animationTool='move';drawFrame(state.currentFrame);updateInfo();e.preventDefault();return true;}
  const tools={m:'move',l:'lasso',r:'rectangle',p:'pencil',d:'dropper',e:'eraser',w:'wand',g:'bucket'};
  if(!e.shiftKey&&tools[key]){e.preventDefault();setAnimationTool(tools[key]);return true;}
  if(!e.shiftKey&&['b','h'].includes(key)){e.preventDefault();return true;}
  if(e.shiftKey&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) {
    const layer=activeAnimationLayer(),offset=animationLayerOffset(layer);if(!offset)return true;
    e.preventDefault();const axis=['ArrowLeft','ArrowRight'].includes(e.key)?'x':'y',delta=['ArrowLeft','ArrowUp'].includes(e.key)?-1:1;
    setAnimationOffset(layer.id,axis,offset[axis]+delta);return true;
  }
  return false;
}

animationEls.input.addEventListener('change',e=>loadAnimationSprites(e.target.files));
animationEls.newLayer.addEventListener('click',createEmptyAnimationLayer);
animationEls.newGroup.addEventListener('click',createAnimationGroup);
animationEls.merge.addEventListener('click',mergeAnimationLayers);
animationEls.exportLayer.addEventListener('click', exportAnimationLayerPng);
animationEls.copy.addEventListener('click',copyAnimationLayers);
animationEls.paste.addEventListener('click',pasteAnimationLayers);
['dragenter','dragover'].forEach(type=>animationEls.drop.addEventListener(type,e=>{e.preventDefault();animationEls.drop.classList.add('dragover');}));
['dragleave','drop'].forEach(type=>animationEls.drop.addEventListener(type,e=>{e.preventDefault();animationEls.drop.classList.remove('dragover');}));
animationEls.drop.addEventListener('drop',e=>loadAnimationSprites(e.dataTransfer.files));
animationEls.group.querySelectorAll('[data-animation-tool]').forEach(button => {
  if (button !== animationEls.selectionButton) button.addEventListener('click', () => setAnimationTool(button.dataset.animationTool));
});
animationEls.selectionButton.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  cancelAnimationSelectionHold();
  animationSelectionHeld = false;
  animationSelectionHold = setTimeout(() => {
    animationSelectionHold = null;
    animationSelectionHeld = true;
    setAnimationSelectionMenuOpen(true);
  }, 400);
});
['pointerup', 'pointercancel', 'pointerleave'].forEach(type => {
  animationEls.selectionButton.addEventListener(type, cancelAnimationSelectionHold);
});
animationEls.selectionButton.addEventListener('click', e => {
  if (animationSelectionHeld && e.detail) {
    animationSelectionHeld = false;
    return;
  }
  if (!animationEls.selectionMenu.hidden) setAnimationSelectionMenuOpen(false);
  else setAnimationTool(animationEls.selectionButton.dataset.animationTool);
});
animationEls.selectionButton.addEventListener('contextmenu', e => {
  e.preventDefault();
  setAnimationSelectionMenuOpen(true);
});
animationEls.selectionButton.addEventListener('keydown', e => {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    e.stopPropagation();
    setAnimationSelectionMenuOpen(true);
    animationEls.selectionMenu.querySelector('button').focus();
  } else if (e.key === 'Escape' && !animationEls.selectionMenu.hidden) {
    e.stopPropagation();
    setAnimationSelectionMenuOpen(false);
  }
});
animationEls.selectionMenu.addEventListener('click', e => {
  const tool = e.target.closest('[data-animation-selection-tool]')?.dataset.animationSelectionTool;
  if (!tool) return;
  setAnimationSelectionMenuOpen(false);
  if (state.animationTool !== tool) setAnimationTool(tool);
  animationEls.selectionButton.focus();
});
animationEls.selectionMenu.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  e.stopPropagation();
  setAnimationSelectionMenuOpen(false);
  animationEls.selectionButton.focus();
});
document.addEventListener('pointerdown', e => {
  if (!e.target.closest?.('.animation-selection-tool')) setAnimationSelectionMenuOpen(false);
});
animationEls.wandSettings.addEventListener('input', () => {
  state.animationWandSettings = animationWandSettings({
    antialias: animationEls.wandAntialias.checked,
    contiguous: animationEls.wandContiguous.checked,
    tolerance: animationEls.wandTolerance.value
  });
});
animationEls.split.addEventListener('click',splitAnimationSelection);
$('animationClearSelectionButton').addEventListener('click',()=>{commitAnimationSelection(null);drawFrame(state.currentFrame);updateAnimationUi();});
animationEls.size.addEventListener('input',e=>setAnimationBrushSize(e.target.value));
animationEls.colors.addEventListener('click',e=>{
  const button=e.target.closest('[data-animation-color]');if(!button)return;const index=Number(button.dataset.animationColor);
  if(index===state.activePencilColorIndex)openColorPicker({type:'pencil',index},state.pencilColors[index]||state.pencilColor,'Pencil Color');
  else selectPencilColor(index);
});
animationEls.colors.addEventListener('contextmenu', e => {
  const button = e.target.closest('[data-animation-color]');
  if (!button || button.disabled) return;
  e.preventDefault();
  openPencilColorContextMenu(Number(button.dataset.animationColor), e.clientX, e.clientY);
});
animationEls.list.addEventListener('click',e=>{
  if(animationLayerDrag?.active)return;
  const item=e.target.closest('[data-animation-id]');if(!item||e.target.closest('input'))return;
  const id=item.dataset.animationId,action=e.target.closest('[data-animation-action]')?.dataset.animationAction;
  if(action==='remove'){removeAnimationLayer(id);return;}
  if(action==='visible'){toggleAnimationVisibility(id);return;}
  if(action==='all-frames'){toggleAnimationAllFrames(id);return;}
  const flip=e.target.closest('[data-animation-flip]');if(flip){toggleAnimationFlip(id,flip.dataset.animationFlip);return;}
  selectAnimationLayer(id,{toggle:e.ctrlKey||e.metaKey,range:e.shiftKey});
});
function beginAnimationLayerRename(id) {
  const item=[...animationEls.list.querySelectorAll('[data-animation-id]')].find(item=>item.dataset.animationId===id),name=item?.querySelector('.animation-layer-name');
  const layer=animationLayerList().find(layer=>layer.id===id);if(!name||!layer)return;
  const input=document.createElement('input');input.type='text';input.className='reference-layer-rename-input animation-layer-rename-input';input.value=layer.name;input.setAttribute('aria-label',layer.group?'Group name':'Sprite layer name');name.replaceWith(input);input.focus();input.select();
  let done=false;const finish=commit=>{if(done)return;done=true;if(commit)renameAnimationLayer(layer.id,input.value);else updateAnimationUi(true);};
  input.addEventListener('blur',()=>finish(true));input.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key==='Escape'){e.preventDefault();e.stopPropagation();finish(e.key==='Enter');}});
}
animationEls.list.addEventListener('dblclick',e=>{
  const item=e.target.closest('[data-animation-id]');if(!item||e.target.closest('input,[data-animation-action],[data-animation-flip]'))return;
  const id=item.dataset.animationId,layer=animationLayerList().find(layer=>layer.id===id);
  if(layer?.group){toggleAnimationGroup(id);return;}
  if(e.target.closest('.animation-layer-name'))beginAnimationLayerRename(id);
});
animationEls.list.addEventListener('focusin',e=>{if(e.target.matches('[data-animation-offset],[data-animation-opacity]')){pause(false,{updateInfo:false});animationInputHistory=null;}});
animationEls.list.addEventListener('input',e=>{
  const input=e.target;
  if (input.matches('[data-animation-opacity]')) {
    const id = input.closest('[data-animation-id]').dataset.animationId, key = `${id}:opacity`;
    const layer = animationLayerList().find(item => item.id === id), opacity = normalizeAnimationOpacity(input.value);
    if (!layer || opacity === normalizeAnimationOpacity(layer.opacity)) return;
    if (animationInputHistory !== key) { pushHistory(); animationInputHistory = key; }
    ensureAnimationLayers().find(item => item.id === id).opacity = opacity;
    markFrameBitmapsDirty();
    drawFrame(state.currentFrame, { fast: true, skipThumb: true });
    return;
  }
  if(!input.matches('[data-animation-offset]'))return;
  const id=input.closest('[data-animation-id]').dataset.animationId,key=`${id}:${state.currentFrame}:${input.dataset.animationOffset}`;
  if(animationInputHistory!==key){pushHistory();animationInputHistory=key;}
  setAnimationOffset(id,input.dataset.animationOffset,input.value,false);
});
function finishAnimationOpacityInput(e) {
  if (!e.target.matches('[data-animation-opacity]')) return;
  const id = e.target.closest('[data-animation-id]').dataset.animationId;
  if (animationInputHistory !== `${id}:opacity`) return;
  animationInputHistory = null;
  e.target.value = normalizeAnimationOpacity(e.target.value);
  buildFilmstrip();
  updateInfo({ deferHiddenPalette: true });
}
animationEls.list.addEventListener('change', e => {
  if (e.target.matches('[data-animation-offset]')) { animationInputHistory = null; animationChanged(); }
  else finishAnimationOpacityInput(e);
});
animationEls.list.addEventListener('focusout', finishAnimationOpacityInput);
animationEls.list.addEventListener('keydown',e=>{
  if(e.target.closest('input'))return;
  const item=e.target.closest('[data-animation-id]');if(!item||!e.altKey||!['ArrowUp','ArrowDown'].includes(e.key))return;
  const all=animationLayerList(),active=all.find(layer=>layer.id===item.dataset.animationId),layers=all.filter(layer=>(layer.parentId||'')===(active?.parentId||'')),i=layers.findIndex(layer=>layer.id===item.dataset.animationId),target=layers[i+(e.key==='ArrowUp'?-1:1)];
  if(target){e.preventDefault();e.stopPropagation();moveAnimationLayer(item.dataset.animationId,target.id,e.key==='ArrowDown');}
});
animationEls.list.addEventListener('pointerdown',e=>{
  const name=e.target.closest('.animation-layer-name');if(!name||e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey)return;
  animationLayerDrag={id:name.closest('[data-animation-id]').dataset.animationId,pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,target:name,active:false};
});
document.addEventListener('pointermove',e=>{
  const drag=animationLayerDrag;if(!drag||drag.pointerId!==e.pointerId)return;
  if(!drag.active&&Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)<5)return;
  e.preventDefault();drag.active=true;drag.target.setPointerCapture(e.pointerId);
  const items=[...animationEls.list.querySelectorAll('[data-animation-id]')];items.forEach(item=>item.classList.remove('animation-drop-before','animation-drop-after','animation-drop-inside','dragging-animation'));
  items.find(item=>item.dataset.animationId===drag.id)?.classList.add('dragging-animation');
  const moving=animationSubtreeIds(drag.id),other=items.filter(item=>!moving.has(item.dataset.animationId));let target=other.find(item=>e.clientY<item.getBoundingClientRect().bottom)||other[other.length-1];
  drag.targetId='';drag.intoGroup=false;
  if(target){const r=target.getBoundingClientRect(),layer=animationLayerList().find(layer=>layer.id===target.dataset.animationId),fraction=(e.clientY-r.top)/r.height;drag.targetId=layer.id;drag.intoGroup=!!layer.group&&fraction>.25&&fraction<.75;drag.after=fraction>=.5;target.classList.add(drag.intoGroup?'animation-drop-inside':drag.after?'animation-drop-after':'animation-drop-before');}
  const listRect=animationEls.list.getBoundingClientRect();if(e.clientY<listRect.top+24)animationEls.list.scrollTop-=12;else if(e.clientY>listRect.bottom-24)animationEls.list.scrollTop+=12;
},{passive:false});
function finishAnimationLayerDrag(e) {
  const drag=animationLayerDrag;if(!drag||drag.pointerId!==e.pointerId)return;
  animationLayerDrag=null;if(drag.target.hasPointerCapture?.(e.pointerId))drag.target.releasePointerCapture(e.pointerId);
  animationEls.list.querySelectorAll('[data-animation-id]').forEach(item=>item.classList.remove('animation-drop-before','animation-drop-after','animation-drop-inside','dragging-animation'));
  if(drag.active){e.preventDefault();if(e.type!=='pointercancel'&&drag.targetId)moveAnimationLayer(drag.id,drag.targetId,drag.after,drag.intoGroup);}
}
document.addEventListener('pointerup',finishAnimationLayerDrag);document.addEventListener('pointercancel',finishAnimationLayerDrag);
resetAnimationState();
