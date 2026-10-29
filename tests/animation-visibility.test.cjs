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
    clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }, renderBrushCursorOverlay() {}
  };
  context.hasFrames = () => context.state.frames.length > 0;
  context.frameFlipX = i => context.state.frameFlips[i];context.frameFlipY = i => context.state.frameFlipYs[i];
  context.framePos = i => context.state.frameOffsets[i];context.frameScale = () => ({x:1,y:1});
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

function layeredEditor() {
  const app=editor();
  app.state.animationLayers=[{id:'a',name:'Arm',visible:true},{id:'b',name:'Body',visible:true},{id:'c',name:'Head',visible:true}];
  app.state.frames.forEach(frame=>{frame.animationCels=Object.fromEntries(['a','b','c'].map((id,i)=>[id,{canvas:{width:16,height:16},offsetX:i*5,offsetY:0,flipX:false,flipY:false,tag:id}]));});
  app.state.activeAnimationLayerId='a';
  return app;
}

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
