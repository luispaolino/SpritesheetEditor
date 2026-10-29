const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function editor() {
  const element = { addEventListener() {}, querySelectorAll() { return []; }, classList: { contains() { return false; } } };
  const context = {
    state: { frames: [{ id: 'frame-a', canvas: {width:64,height:64} }, { id: 'frame-b', canvas: {width:64,height:64} }], currentFrame: 0, imageName: 'Imported sheet', cageWidth:64,cageHeight:64,frameOffsets:[{x:0,y:0},{x:0,y:0}],frameFlips:[false,false],frameFlipYs:[false,false] },
    $() { return element; }, document: { addEventListener() {} },
    sheetBaseName(name) { return name; },
    pause() {}, pushHistory() {}, markFrameBitmapsDirty() {}, buildFilmstrip() {}, drawFrame() {}, updateInfo() {},
    makeMask(width=64,height=64) { return { width,height,getContext() { return {}; } }; }, drawBaseSprite() {},
    canvasClone(canvas) { return {...canvas}; },
    temporaryPencilColorPickerActive() { return false; },
    clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }, renderBrushCursorOverlay() {}
  };
  context.hasFrames = () => context.state.frames.length > 0;
  context.frameFlipX = i => context.state.frameFlips[i];context.frameFlipY = i => context.state.frameFlipYs[i];
  context.framePos = i => context.state.frameOffsets[i];context.frameScale = () => ({x:1,y:1});
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'animation.js'), 'utf8'), context);
  return context;
}

function clipboardEditor() {
  const app=layeredEditor();app.updateAnimationUi=()=>{};return app;
}

test('copy captures an immutable current-frame cel and repeated pastes are independent',()=>{
  const app=clipboardEditor(), original=app.state.frames[0].animationCels.a;
  original.flipX=true;original.canvas.pixel='red';
  assert.equal(app.copyAnimationLayers(),true);
  original.offsetX=42;original.canvas.pixel='blue';
  app.pasteAnimationLayers();const first=app.activeAnimationLayer(), cel=app.animationCel(first);
  assert.equal(cel.offsetX,0);assert.equal(cel.flipX,true);assert.equal(cel.canvas.pixel,'red');
  cel.canvas.pixel='green';app.pasteAnimationLayers();const second=app.activeAnimationLayer();
  assert.equal(app.animationCel(second).canvas.pixel,'red');
  assert.notEqual(first.id,second.id);assert.notEqual(first.name,second.name);
  assert.deepEqual(Array.from(app.state.animationLayers,layer=>layer.id),[second.id,first.id,'a','b','c']);
});

test('paste into another frame creates artwork only in the destination and preserves existing cels',()=>{
  const app=clipboardEditor(), before=app.state.frames[1].animationCels.a;
  app.state.frames[0].animationCels.a.offsetY=17;app.copyAnimationLayers();app.state.currentFrame=1;
  app.pasteAnimationLayers();const copy=app.activeAnimationLayer();
  assert.equal(app.animationCel(copy,1).offsetY,17);assert.equal(app.animationCel(copy,0),null);
  assert.equal(app.state.frames[1].animationCels.a,before);
});

test('group copy retains nested hierarchy, own visibility, flips, and collapse without copying twice',()=>{
  const app=clipboardEditor();app.state.selectedAnimationLayerIds=['a','b'];app.createAnimationGroup();
  const inner=app.activeAnimationLayer();app.state.selectedAnimationLayerIds=[inner.id,'c'];app.createAnimationGroup();
  const outer=app.activeAnimationLayer();
  app.state.selectedAnimationLayerIds=[outer.id,inner.id,'a'];
  app.state.frames[0].animationVisibility={b:false};app.state.frames[0].animationCels.a.flipY=true;
  app.copyAnimationLayers();app.state.currentFrame=1;app.pasteAnimationLayers();
  const pasted=app.activeAnimationLayer(), children=app.state.animationLayers.filter(layer=>layer.parentId===pasted.id);
  assert.equal(pasted.group,true);assert.equal(pasted.collapsed,true);assert.equal(children.length,2);
  const nested=children.find(layer=>layer.group), leaves=app.state.animationLayers.filter(layer=>layer.parentId===nested.id);
  assert.equal(leaves.length,2);assert.equal(app.animationLayerOwnVisible(leaves[1]),false);
  assert.equal(app.animationCel(leaves[0]).flipY,true);assert.equal(app.animationCel(pasted),null);
  assert.equal(app.state.animationLayers.length,10);
  assert.equal(Object.hasOwn(app.state.frames[1].animationCels,pasted.id),false);
});

test('copied base is rendered with masks without changing the imported source',()=>{
  const app=editor();app.updateAnimationUi=()=>{};const before=app.state.frames[0].canvas,calls=[];
  app.drawBaseSprite=(_t,i,x,y,opt)=>calls.push({i,x,y,opt});app.copyAnimationLayers();app.state.currentFrame=1;app.pasteAnimationLayers();
  assert.equal(app.activeAnimationLayer().base,false);assert.equal(app.animationCel(app.activeAnimationLayer()).canvas.width,64);
  assert.equal(calls.length,1);assert.equal(calls[0].opt.applyMask,true);assert.equal(app.state.frames[0].canvas,before);
});

test('pasting above a grouped child keeps the new subtree inside the destination group',()=>{
  const app=clipboardEditor();app.copyAnimationLayers();app.state.selectedAnimationLayerIds=['b','c'];app.createAnimationGroup();
  const group=app.activeAnimationLayer();app.selectAnimationLayer('b');app.pasteAnimationLayers();
  const copy=app.activeAnimationLayer();assert.equal(copy.parentId,group.id);
  const ids=Array.from(app.state.animationLayers,layer=>layer.id);assert.equal(ids.indexOf(copy.id),ids.indexOf('b')-1);
});

test('copy and paste keyboard shortcuts respect modifiers and do not repeat pastes while held',()=>{
  const app=clipboardEditor();app.animationPanelActive=()=>true;let prevented=0;
  const press=(key,options={})=>app.handleAnimationKeyDown({key,preventDefault(){prevented++;},...options});
  assert.equal(press('c',{ctrlKey:true}),true);press('v',{metaKey:true});
  const count=app.state.animationLayers.length;press('v',{ctrlKey:true,repeat:true});
  assert.equal(app.state.animationLayers.length,count);assert.equal(prevented,3);
  assert.equal(press('v',{ctrlKey:true,altKey:true}),false);
});

test('the document keyboard handler routes Animation copy/paste and preserves text-field shortcuts',()=>{
  const app=clipboardEditor(), modal={classList:{contains(){return false;}}};
  app.animationPanelActive=()=>true;app.colorPicker={pickMode:false};app.els=new Proxy({}, {get(){return modal;}});
  app.document.activeElement={tagName:'BUTTON'};app.document.addEventListener=(_type,handler)=>{app.keydown=handler;};
  app.canvasContentAvailable=()=>true;app.spriteSheetBuilderPreviewHovered=()=>false;app.spriteSheetBuilderTimelineAvailable=()=>false;
  app.selectSpriteSheetBuilderFrameFromNumberKey=()=>false;
  const html=fs.readFileSync(path.join(__dirname,'..','SpritesheetEditor.html'),'utf8'),start=html.indexOf("    document.addEventListener('keydown', e => {"),end=html.indexOf("    document.addEventListener('keyup', e => {",start);
  vm.runInContext(html.slice(start,end),app);
  const press=key=>app.keydown({key,ctrlKey:true,preventDefault(){}});
  press('c');press('v');assert.equal(app.state.animationLayers.length,4);
  app.document.activeElement={tagName:'INPUT'};press('v');assert.equal(app.state.animationLayers.length,4);
  app.document.activeElement={tagName:'TEXTAREA'};press('c');press('v');assert.equal(app.state.animationLayers.length,4);
});

test('paste without copied artwork has no history or document changes',()=>{
  const app=clipboardEditor();let history=0;app.pushHistory=()=>history++;
  assert.equal(app.pasteAnimationLayers(),false);assert.equal(history,0);assert.equal(app.state.animationLayers.length,3);
});

function sourceFunction(name) {
  const html=fs.readFileSync(path.join(__dirname,'..','SpritesheetEditor.html'),'utf8'),start=html.indexOf(`    function ${name}(`);
  return html.slice(start,html.indexOf('\n    function ',start+1));
}

test('Ctrl/Cmd temporarily picks color for Animation Pencil and Eraser and restores either tool',()=>{
  for(const tool of ['pencil','eraser']) {
    const app=editor();app.state.animationTool=tool;app.animationPanelActive=()=>true;
    vm.runInContext(sourceFunction('temporaryPencilColorPickerActive')+'\n'+sourceFunction('setPencilCtrlPickMode'),app);
    assert.equal(app.temporaryPencilColorPickerActive({ctrlKey:true}),true);
    app.setPencilCtrlPickMode(true);assert.equal(app.temporaryPencilColorPickerActive(),true);
    app.setPencilCtrlPickMode(false);assert.equal(app.temporaryPencilColorPickerActive(),false);assert.equal(app.state.animationTool,tool);
    app.state.animationTool='lasso';assert.equal(app.temporaryPencilColorPickerActive({ctrlKey:true}),false);
  }
});

test('brush preview hides over menus and outside the canvas and returns on the canvas',()=>{
  const app=editor(), canvas={closest(){return null;}}, menu={closest(){return null;}}, control={closest(){return this;}};
  let target=canvas,hidden=0;
  app.document.elementFromPoint=()=>target;app.els={canvasShell:{contains(node){return node===canvas||node===control;}}};
  app.hideBrushCursor=()=>{app.state.brushCursorVisible=false;hidden++;};app.pointerCagePoint=()=>({x:10,y:20});
  vm.runInContext(sourceFunction('updateBrushCursorFromEvent'),app);
  app.updateBrushCursorFromEvent({clientX:100,clientY:100});assert.equal(app.state.brushCursorVisible,true);
  target=menu;assert.equal(app.updateBrushCursorFromEvent({}),null);assert.equal(app.state.brushCursorVisible,false);
  target=control;assert.equal(app.updateBrushCursorFromEvent({}),null);
  target=null;assert.equal(app.updateBrushCursorFromEvent({}),null);assert.equal(hidden,3);
  target=canvas;app.updateBrushCursorFromEvent({});assert.equal(app.state.brushCursorVisible,true);
});

function selectionEditor(tool='rectangle') {
  const app=editor();app.animationPanelActive=()=>true;app.updateAnimationUi=()=>{};app.state.animationTool=tool;
  app.makeMask=(width=64,height=64)=>({width,height,getContext(){return {createImageData(w,h){return {data:new Uint8ClampedArray(w*h*4)};},putImageData(){}};}});
  app.pointerGuidePoint=e=>({x:e.clientX,y:e.clientY});app.pointerCagePoint=e=>({x:Math.floor(e.clientX),y:Math.floor(e.clientY)});
  app.pointerDelta=(e,x,y)=>({dx:e.clientX-x,dy:e.clientY-y});
  app.els={canvasShell:{classList:{add(){},remove(){},toggle(){}},setPointerCapture(){},hasPointerCapture(){return false;}}};
  return app;
}
function selectionDrag(app,points,modifiers={}) {
  const event=point=>({clientX:point[0],clientY:point[1],pointerId:1,...modifiers});
  app.startAnimationCanvasDrag(event(points[0]));
  points.slice(1).forEach(point=>app.moveAnimationCanvasDrag(event(point)));
  app.finishAnimationCanvasDrag({...event(points.at(-1)),type:'pointerup'});
  return app.animationSelectionRaster()?.alpha;
}

test('Alt subtracts holes and Shift adds disjoint regions using a binary mask for either tool',()=>{
  for(const tool of ['rectangle','lasso']) {
    const app=selectionEditor(tool),shape=(x1,y1,x2,y2)=>tool==='rectangle'?[[x1,y1],[x2,y2]]:[[x1,y1],[x2,y1],[x2,y2],[x1,y2]];
    let alpha=selectionDrag(app,shape(2,2,10,10));assert.equal(alpha.filter(value=>value).length,64);
    alpha=selectionDrag(app,shape(4,4,6,6),{altKey:true});assert.equal(alpha.filter(value=>value).length,60);assert.equal(alpha[4*64+4],0);
    alpha=selectionDrag(app,shape(12,2,14,4),{shiftKey:true});assert.equal(alpha.filter(value=>value).length,64);
    assert.equal(alpha[2*64+12],255);assert.ok(alpha.every(value=>value===0||value===255));
  }
});

test('Shift and Alt drags inside a selection change its area instead of moving it',()=>{
  const app=selectionEditor();selectionDrag(app,[[2,2],[10,10]]);
  let alpha=selectionDrag(app,[[6,6],[12,12]],{shiftKey:true});assert.equal(alpha.filter(value=>value).length,84);assert.equal(alpha[2*64+2],255);
  alpha=selectionDrag(app,[[3,3],[5,5]],{altKey:true});assert.equal(alpha.filter(value=>value).length,80);assert.equal(alpha[3*64+3],0);
});

test('selection arrows move only the outline, use Shift for 10 pixels, and retain off-canvas pixels',()=>{
  const app=selectionEditor();selectionDrag(app,[[2,2],[5,5]]);let history=0;app.pushHistory=()=>history++;
  const canvas=app.state.frames[0].canvas,offset=app.state.frameOffsets[0];
  app.handleAnimationKeyDown({key:'ArrowRight',preventDefault(){}});
  assert.equal(app.animationSelectionRaster().alpha[2*64+3],255);assert.equal(app.state.currentFrame,0);
  app.handleAnimationKeyDown({key:'ArrowDown',shiftKey:true,preventDefault(){}});
  assert.equal(app.animationSelectionRaster().alpha[12*64+3],255);
  app.moveAnimationSelection(-100,0);assert.equal(app.animationSelectionRaster().alpha.some(value=>value),false);
  app.moveAnimationSelection(100,0);assert.equal(app.animationSelectionRaster().alpha.filter(value=>value).length,9);
  assert.equal(app.state.frames[0].canvas,canvas);assert.equal(app.state.frameOffsets[0],offset);assert.equal(history,0);
});

test('dragging inside a selection moves it while dragging outside replaces it',()=>{
  const app=selectionEditor();selectionDrag(app,[[2,2],[6,6]]);
  let alpha=selectionDrag(app,[[3,3],[10,8]]);assert.equal(alpha.filter(value=>value).length,16);
  assert.equal(alpha[7*64+9],255);assert.equal(alpha[2*64+2],0);
  alpha=selectionDrag(app,[[20,20],[22,22]]);assert.equal(alpha.filter(value=>value).length,4);assert.equal(alpha[7*64+9],0);
});

test('frame-local cels and their groups leave the list when changing frames and remain available on return',()=>{
  const app=layeredEditor();app.state.selectedAnimationLayerIds=['a','b'];app.createAnimationGroup();const group=app.activeAnimationLayer();
  delete app.state.frames[1].animationCels.a;delete app.state.frames[1].animationCels.b;
  app.state.currentFrame=1;
  assert.deepEqual(Array.from(app.animationFrameLayers(),layer=>layer.id),['c']);assert.equal(app.activeAnimationLayer().id,'c');
  assert.deepEqual(Array.from(app.selectedAnimationLayerIds()),['c']);
  app.state.currentFrame=0;assert.equal(app.activeAnimationLayer().id,group.id);
  assert.deepEqual(Array.from(app.animationVisibleLayers(),layer=>layer.id),[group.id,'c']);
});

test('Delete/Backspace consume the key in selection tools, erase once, and do nothing without a selection',()=>{
  const app=selectionEditor();let history=0;app.pushHistory=()=>history++;
  assert.equal(app.handleAnimationKeyDown({key:'Delete',preventDefault(){}}),true);assert.equal(history,0);
  selectionDrag(app,[[2,2],[6,6]]);
  const canvas=app.state.frames[0].canvas, draws=[];
  canvas.getContext=()=>({save(){},restore(){},drawImage(mask,x,y){draws.push([this.globalCompositeOperation,mask,x,y]);}});
  app.animationBakeBase=()=>canvas;app.state.indexedFrames=[];
  app.handleAnimationKeyDown({key:'Delete',preventDefault(){}});
  assert.equal(history,1);assert.equal(draws.length,1);assert.equal(draws[0][0],'destination-out');
  assert.equal(app.validAnimationSelection(),true);assert.equal(app.state.frames.length,2);
  app.handleAnimationKeyDown({key:'Backspace',repeat:true,preventDefault(){}});assert.equal(history,1);
});

test('erasing a transformed overlay keeps its transforms and neighboring frames intact',()=>{
  const app=selectionEditor();app.createEmptyAnimationLayer();const layer=app.activeAnimationLayer();app.state.animationTool='lasso';
  selectionDrag(app,[[2,2],[6,2],[6,6],[2,6]]);
  const cel=app.animationCel(layer),other=app.animationCel(layer,1);cel.offsetX=12;cel.flipX=true;
  const local={local:true},erased=[];app.animationLocalMask=(mask,target)=>{assert.equal(target,cel);return local;};
  cel.canvas.getContext=()=>({save(){},restore(){},drawImage(mask){erased.push(mask);}});app.state.indexedFrames=[];
  app.eraseAnimationSelection();assert.equal(erased[0],local);assert.equal(cel.offsetX,12);assert.equal(cel.flipX,true);
  assert.equal(app.animationCel(layer,1),other);assert.notEqual(other.canvas,cel.canvas);
});

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

function layeredEditor() {
  const app=editor();
  app.state.animationLayers=[{id:'a',name:'Arm',visible:true},{id:'b',name:'Body',visible:true},{id:'c',name:'Head',visible:true}];
  app.state.frames.forEach(frame=>{frame.animationCels=Object.fromEntries(['a','b','c'].map((id,i)=>[id,{canvas:{width:16,height:16},offsetX:i*5,offsetY:0,flipX:false,flipY:false,tag:id}]));});
  app.state.activeAnimationLayerId='a';
  return app;
}

function mergeEditor() {
  const app=layeredEditor();
  app.makeMask=()=>{const canvas={width:64,height:64,drawn:[]};canvas.getContext=()=>({drawImage(source){canvas.drawn.push(...(source.drawn || [source.tag]));}});return canvas;};
  app.state.frames.forEach((frame,i)=>Object.entries(frame.animationCels).forEach(([id,cel])=>{cel.canvas.tag=`${id}-${i}`;}));
  app.drawAnimationCel=(target,cel)=>{if(cel)target.drawImage(cel.canvas);};
  return app;
}

test('Merge flattens selected layers in render order with independent artwork in each frame',()=>{
  const app=mergeEditor();app.state.selectedAnimationLayerIds=['a','b'];let history=0;app.pushHistory=()=>history++;
  assert.equal(app.mergeAnimationLayers(),true);const merged=app.activeAnimationLayer();
  assert.deepEqual(Array.from(app.state.animationLayers,layer=>layer.id),[merged.id,'c']);
  assert.deepEqual(app.animationCel(merged,0).canvas.drawn,['b-0','a-0']);
  assert.deepEqual(app.animationCel(merged,1).canvas.drawn,['b-1','a-1']);
  assert.notEqual(app.animationCel(merged,0).canvas,app.animationCel(merged,1).canvas);
  assert.equal(app.state.frames[0].animationCels.a,undefined);assert.equal(history,1);
});

test('Merge accepts a single group and removes its subtree without touching other layers',()=>{
  const app=mergeEditor();app.state.selectedAnimationLayerIds=['a','b'];app.createAnimationGroup();const group=app.activeAnimationLayer();
  const other=app.state.frames[0].animationCels.c;app.mergeAnimationLayers();const merged=app.activeAnimationLayer();
  assert.equal(merged.name,group.name);assert.equal(merged.group,false);assert.equal(merged.parentId,'');
  assert.deepEqual(app.animationCel(merged).canvas.drawn,['b-0','a-0']);assert.equal(app.state.animationLayers.length,2);
  assert.equal(app.state.frames[0].animationCels.c,other);
});

test('Merge retains frame-local membership and bakes descendant visibility per frame',()=>{
  const app=mergeEditor();app.state.selectedAnimationLayerIds=['a','b'];app.createAnimationGroup();
  delete app.state.frames[1].animationCels.a;delete app.state.frames[1].animationCels.b;
  app.state.frames[0].animationVisibility={b:false};app.mergeAnimationLayers();const merged=app.activeAnimationLayer();
  assert.deepEqual(app.animationCel(merged).canvas.drawn,['a-0']);assert.equal(app.animationCel(merged,1),null);
  app.state.currentFrame=1;assert.deepEqual(Array.from(app.animationFrameLayers(),layer=>layer.id),['c']);
});

test('Merge inside a hidden surviving parent keeps the artwork and inherits that parent visibility',()=>{
  const app=mergeEditor();app.state.selectedAnimationLayerIds=['a','b','c'];app.createAnimationGroup();const group=app.activeAnimationLayer();
  app.state.frames[0].animationVisibility={[group.id]:false};app.state.activeAnimationLayerId='a';app.state.selectedAnimationLayerIds=['a','b'];
  app.mergeAnimationLayers();const merged=app.activeAnimationLayer();assert.equal(merged.parentId,group.id);
  assert.deepEqual(app.animationCel(merged).canvas.drawn,['b-0','a-0']);assert.equal(app.animationLayerVisible(merged),false);
  app.state.frames[0].animationVisibility[group.id]=true;assert.equal(app.animationLayerVisible(merged),true);
});

test('Merge does nothing for a single ordinary layer',()=>{
  const app=mergeEditor();let history=0;app.pushHistory=()=>history++;
  assert.equal(app.mergeAnimationLayers(),false);assert.equal(history,0);assert.equal(app.state.animationLayers.length,3);
});

test('New Layer inserts above the selected layer with independent empty cels in every frame', () => {
  const app=editor();app.createEmptyAnimationLayer();
  const id=app.state.activeAnimationLayerId;
  assert.equal(app.state.animationLayers[0].id,id);
  assert.equal(app.state.animationLayers[1].id,'animation-base');
  assert.equal(app.state.frames[0].animationCels[id].canvas.width,64);
  assert.notEqual(app.state.frames[0].animationCels[id].canvas,app.state.frames[1].animationCels[id].canvas);
  app.state.frames[0].animationCels[id].offsetX=9;
  assert.equal(app.state.frames[1].animationCels[id].offsetX,0);
});

test('grouping selected layers preserves child order and rendering while collapsed', () => {
  const app=layeredEditor();app.state.selectedAnimationLayerIds=['a','c'];app.createAnimationGroup();
  const group=app.activeAnimationLayer();
  assert.equal(group.group,true);assert.equal(group.collapsed,true);
  assert.deepEqual(Array.from(app.state.animationLayers,layer=>layer.id),[group.id,'a','c','b']);
  assert.deepEqual(Array.from(app.animationVisibleLayers(),layer=>layer.id),[group.id,'b']);
  assert.equal(app.state.animationLayers.find(layer=>layer.id==='a').parentId,group.id);
  const drawn=[];app.drawAnimationCel=(_t,cel)=>drawn.push(cel.tag);
  app.drawAnimationSprite({save(){},beginPath(){},rect(){},clip(){},restore(){}},0,0,0,{});
  assert.deepEqual(drawn,['b','c','a']);
  group.collapsed=false;
  assert.deepEqual(Array.from(app.animationVisibleLayers(),layer=>layer.id),[group.id,'a','c','b']);
});

test('group visibility affects descendants only in the current frame', () => {
  const app=layeredEditor();app.state.selectedAnimationLayerIds=['a','b'];app.createAnimationGroup();
  const group=app.activeAnimationLayer(), child=app.state.animationLayers.find(layer=>layer.id==='a');
  app.toggleAnimationVisibility(group.id);
  assert.equal(app.animationLayerVisible(child,0),false);
  assert.equal(app.animationLayerVisible(child,1),true);
  assert.equal(app.animationLayerOwnVisible(child,0),true);
  assert.equal(app.animationLayerVisible(app.state.animationLayers.find(layer=>layer.id==='c'),0),true);
});

test('groups move and flip their children together without changing other frames', () => {
  const app=layeredEditor();app.state.selectedAnimationLayerIds=['a','b'];app.createAnimationGroup();
  const group=app.activeAnimationLayer(), position=app.animationLayerOffset(group);
  app.setAnimationOffset(group.id,'x',position.x+10);
  assert.equal(app.state.frames[0].animationCels.a.offsetX,10);
  assert.equal(app.state.frames[0].animationCels.b.offsetX,15);
  assert.equal(app.state.frames[1].animationCels.a.offsetX,0);
  app.toggleAnimationFlip(group.id,'x');
  assert.equal(app.state.frames[0].animationCels.a.offsetX,15);
  assert.equal(app.state.frames[0].animationCels.b.offsetX,10);
  assert.equal(app.state.frames[0].animationCels.a.flipX,true);
  assert.equal(app.state.frames[1].animationCels.a.flipX,false);
  app.toggleAnimationFlip(group.id,'x');
  assert.equal(app.state.frames[0].animationCels.a.offsetX,10);
  assert.equal(app.state.frames[0].animationCels.b.offsetX,15);
});

test('groups cannot receive pencil or eraser strokes, even through keyboard or direct handlers', () => {
  const app=layeredEditor();app.state.selectedAnimationLayerIds=['a','b'];app.createAnimationGroup();
  const group=app.activeAnimationLayer();app.animationPanelActive=()=>true;
  assert.equal(app.animationCel(group),null);
  for(const tool of ['pencil','eraser']) {
    app.state.animationTool='move';app.setAnimationTool(tool);
    assert.equal(app.state.animationTool,'move');
    app.state.animationTool=tool;let histories=0;app.pushHistory=()=>histories++;
    assert.equal(app.startAnimationCanvasDrag({}),true);
    assert.equal(histories,0);
    assert.equal(app.animationPixelBrushActive(),false);
    vm.runInContext(`animationStroke={layerId:${JSON.stringify(group.id)},frame:0,tool:${JSON.stringify(tool)}}`,app);
    app.paintAnimationLine({x:0,y:0},{x:5,y:5});
    assert.equal(app.state.frames[0].animationCels[group.id],undefined);
  }
});

test('dragging layers into and out of groups preserves subtrees and prevents cycles', () => {
  const app=layeredEditor();app.state.selectedAnimationLayerIds=['a','b'];app.createAnimationGroup();
  const group=app.activeAnimationLayer();
  app.moveAnimationLayer('c',group.id,false,true);
  assert.equal(app.state.animationLayers.find(layer=>layer.id==='c').parentId,group.id);
  assert.equal(group.collapsed,false);
  const before=JSON.stringify(app.state.animationLayers);
  app.moveAnimationLayer(group.id,'a',false,true);
  assert.equal(JSON.stringify(app.state.animationLayers),before);
  app.moveAnimationLayer('c',group.id,false);
  assert.equal(app.state.animationLayers[0].id,'c');
  assert.equal(app.state.animationLayers[0].parentId,'');
  app.moveAnimationLayer(group.id,'c',false);
  assert.deepEqual(Array.from(app.state.animationLayers,layer=>layer.id),[group.id,'a','b','c']);
});

test('group metadata survives project/history cloning without sharing mutable objects', () => {
  const app=layeredEditor();app.state.selectedAnimationLayerIds=['a','b'];app.createAnimationGroup();
  const group=app.activeAnimationLayer(), saved=app.cloneAnimationLayers(app.state.animationLayers);
  group.name='Changed';group.collapsed=false;
  assert.equal(saved[0].name,'Group 1');assert.equal(saved[0].collapsed,true);
  assert.equal(saved[1].parentId,saved[0].id);
  const restored=app.cloneAnimationLayers(JSON.parse(JSON.stringify(saved)));
  assert.equal(restored[0].group,true);assert.equal(restored[1].parentId,restored[0].id);
});

test('removing a group removes its contents and leaves other layers intact', () => {
  const app=layeredEditor();app.state.selectedAnimationLayerIds=['a','b'];app.createAnimationGroup();
  const group=app.activeAnimationLayer();app.removeAnimationLayer(group.id);
  assert.deepEqual(Array.from(app.state.animationLayers,layer=>layer.id),['c']);
  for(const frame of app.state.frames) {assert.equal(frame.animationCels.a,undefined);assert.equal(frame.animationCels.b,undefined);assert.ok(frame.animationCels.c);}
});

test('New Layer above a grouped child stays inside the same group', () => {
  const app=layeredEditor();app.state.selectedAnimationLayerIds=['a','b'];app.createAnimationGroup();
  const group=app.activeAnimationLayer();group.collapsed=false;app.selectAnimationLayer('b');app.createEmptyAnimationLayer();
  const added=app.activeAnimationLayer(),ids=Array.from(app.state.animationLayers,layer=>layer.id);
  assert.equal(added.parentId,group.id);
  assert.equal(ids.indexOf(added.id)+1,ids.indexOf('b'));
});

test('Ctrl/Cmd selection and Shift ranges select layers for grouping', () => {
  const app=layeredEditor();app.selectAnimationLayer('a');app.selectAnimationLayer('c',{toggle:true});
  assert.deepEqual(Array.from(app.selectedAnimationLayerIds()),['a','c']);
  app.selectAnimationLayer('a');app.selectAnimationLayer('c',{range:true});
  assert.deepEqual(Array.from(app.selectedAnimationLayerIds()),['a','b','c']);
  app.createAnimationGroup();assert.equal(app.animationMovementTargets(app.activeAnimationLayer()).length,3);
});

test('nested groups move as subtrees and invalid parent cycles are repaired on load', () => {
  const app=layeredEditor();app.state.selectedAnimationLayerIds=['a','b'];app.createAnimationGroup();
  const inner=app.activeAnimationLayer();app.state.selectedAnimationLayerIds=[inner.id,'c'];app.createAnimationGroup();
  const outer=app.activeAnimationLayer();assert.equal(app.state.animationLayers.find(layer=>layer.id===inner.id).parentId,outer.id);
  assert.equal(app.animationMovementTargets(outer).length,3);
  const repaired=app.cloneAnimationLayers([{id:'x',group:true,parentId:'y'},{id:'y',group:true,parentId:'x'},{id:'orphan',parentId:'missing'}]);
  assert.equal(repaired.length,3);
  assert.equal(repaired.find(layer=>layer.id==='orphan').parentId,'');
  assert.ok(repaired.some(layer=>layer.group&&!layer.parentId));
});
