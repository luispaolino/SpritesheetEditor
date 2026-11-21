const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function editor() {
  const element = { hidden: true, addEventListener() {}, setAttribute() {}, querySelectorAll() { return []; }, classList: { contains() { return false; } } };
  const documentListeners = {};
  const context = {
    state: { frames: [{ id: 'frame-a', canvas: {width:64,height:64} }, { id: 'frame-b', canvas: {width:64,height:64} }], currentFrame: 0, imageName: 'Imported sheet', cageWidth:64,cageHeight:64,frameOffsets:[{x:0,y:0},{x:0,y:0}],frameFlips:[false,false],frameFlipYs:[false,false] },
    $() { return element; }, documentListeners,
    document: { addEventListener(type, listener) { documentListeners[type] = listener; }, querySelector() { return null; } },
    sheetBaseName(name) { return name; },
    pause() {}, pushHistory() {}, markFrameBitmapsDirty() {}, buildFilmstrip() {}, drawFrame() {}, updateInfo() {},
    makeMask(width=64,height=64) { return { width,height,getContext() { return {}; } }; }, drawBaseSprite() {},
    canvasClone(canvas) { return {...canvas}; },
    canvasAlphaBounds(canvas) { return canvas.empty ? null : { minX:0,minY:0,maxX:canvas.width-1,maxY:canvas.height-1 }; },
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

function paintHistoryEditor() {
  const app=clipboardEditor();
  Object.assign(app.state,{selectedFrameIndices:[0],selectedAnimationLayerIds:['a'],animationBrushSize:8,animationTool:'pencil',
    frameScales:[{x:1,y:1},{x:1,y:1}],frameMasks:[{width:64,height:64},{width:64,height:64}],maskDirty:[false,false],indexedFrames:[null,null],
    pencilColor:{r:12,g:34,b:56,a:255},pencilColors:[{r:12,g:34,b:56,a:255},{r:0,g:0,b:0,a:255}],activePencilColorIndex:0,undoStack:[],redoStack:[]});
  app.cloneColor=color=>({...color});app.clonePencilColors=colors=>colors.map(color=>({...color}));
  app.cloneIndexedFrameInfo=info=>info?{...info}:null;app.clonePencilLayers=layers=>layers.map(layer=>({...layer,canvas:app.canvasClone(layer.canvas)}));
  app.cloneSheetRect=rect=>rect?{...rect}:null;app.syncAfterDataChange=()=>{};
  app.historySuppressDepth=0;app.finishKeyboardNudge=()=>{};app.els={};
  for(const name of ['syncHistoryButtons','pushAnimationPaintHistory','undo','redo'])vm.runInContext(sourceFunction(name),app);
  app.cancelActiveDrag=()=>{};
  return app;
}

test('paint history copies one cel and leaves other layers and frames untouched through Undo/Redo',()=>{
  const app=paintHistoryEditor(),otherFrame=app.state.frames[1].animationCels.a,otherLayer=app.state.frames[0].animationCels.b;
  app.animationCel(app.activeAnimationLayer()).canvas.pixel='before';
  let clones=0;const clone=app.canvasClone;app.canvasClone=canvas=>{clones++;return clone(canvas);};
  app.pushAnimationPaintHistory('a',0);
  assert.equal(clones,1);assert.equal(app.state.undoStack[0].kind,'animation-paint-history');
  app.animationCel(app.activeAnimationLayer()).canvas.pixel='after';app.state.currentFrame=1;app.selectAnimationLayer('b');
  app.undo();
  assert.equal(app.state.currentFrame,0);assert.equal(app.activeAnimationLayer().id,'a');
  assert.equal(app.animationCel(app.activeAnimationLayer()).canvas.pixel,'before');
  assert.equal(app.state.frames[1].animationCels.a,otherFrame);assert.equal(app.state.frames[0].animationCels.b,otherLayer);
  app.redo();
  assert.equal(app.state.currentFrame,1);assert.equal(app.activeAnimationLayer().id,'b');
  assert.equal(app.state.frames[0].animationCels.a.canvas.pixel,'after');
  assert.equal(app.state.frames[1].animationCels.a,otherFrame);assert.equal(app.state.frames[0].animationCels.b,otherLayer);
});

test('paint history restores shared artwork without replacing local cels or other frame artwork',()=>{
  const app=paintHistoryEditor(),layer=app.activeAnimationLayer();layer.sharedCel=app.cloneAnimationCel(app.animationCel(layer));
  layer.sharedCel.canvas.pixel='shared-before';const local=app.state.frames[0].animationCels.a;
  app.pushAnimationPaintHistory(layer.id,0);layer.sharedCel.canvas.pixel='shared-after';
  app.undo();assert.equal(app.animationCel(layer,0).canvas.pixel,'shared-before');assert.equal(app.animationCel(layer,1).canvas.pixel,'shared-before');
  assert.equal(app.state.frames[0].animationCels.a,local);
  app.redo();assert.equal(app.animationCel(layer,1).canvas.pixel,'shared-after');assert.equal(app.state.frames[0].animationCels.a,local);
});

test('base paint history preserves source pixels, transforms, masks, legacy pencil layers, and sheet bounds',()=>{
  const app=paintHistoryEditor();app.state.animationLayers=null;app.state.activeAnimationLayerId='animation-base';
  const frame=app.state.frames[0],other=app.state.frames[1].canvas;
  Object.assign(frame,{canvas:{width:32,height:24,pixel:'base'},sourceCanvas:{width:32,height:24,pixel:'source'},sheetSlice:{x:1,y:2,w:32,h:24},sheetCrop:{x:2,y:3,w:30,h:20},pencilLayers:[{canvas:{width:32,height:24,pixel:'paint'},id:'legacy'}]});
  app.state.frameOffsets[0]={x:10,y:-4};app.state.frameScales[0]={x:2,y:3};app.state.frameFlips[0]=true;
  app.state.frameMasks[0].pixel='mask';app.state.maskDirty[0]=true;
  const saved=app.captureAnimationPaintHistory('animation-base',0);
  frame.canvas.pixel='changed';frame.sourceCanvas.pixel='changed';frame.pencilLayers=[];frame.sheetSlice=null;frame.sheetCrop=null;
  app.state.frameOffsets[0]={x:0,y:0};app.state.frameScales[0]={x:1,y:1};app.state.frameFlips[0]=false;app.state.frameMasks[0].pixel='changed';app.state.maskDirty[0]=false;
  app.restoreAnimationPaintHistory(saved);
  assert.equal(frame.canvas.pixel,'base');assert.equal(frame.sourceCanvas.pixel,'source');assert.equal(frame.pencilLayers[0].canvas.pixel,'paint');
  assert.deepEqual({...frame.sheetSlice},{x:1,y:2,w:32,h:24});assert.deepEqual({...frame.sheetCrop},{x:2,y:3,w:30,h:20});
  assert.deepEqual({...app.state.frameOffsets[0]},{x:10,y:-4});assert.deepEqual({...app.state.frameScales[0]},{x:2,y:3});assert.equal(app.state.frameFlips[0],true);
  assert.equal(app.state.frameMasks[0].pixel,'mask');assert.equal(app.state.maskDirty[0],true);assert.equal(app.state.frames[1].canvas,other);
  frame.canvas.pixel='edit-again';assert.equal(saved.base.canvas.pixel,'base');
});

test('paint history honors the history limit and suppression and invalidates Redo after a new stroke',()=>{
  const app=paintHistoryEditor();
  for(let i=0;i<45;i++)app.pushAnimationPaintHistory('a',0);
  assert.equal(app.state.undoStack.length,40);
  app.undo();assert.equal(app.state.redoStack.length,1);
  app.historySuppressDepth=1;app.pushAnimationPaintHistory('a',0);assert.equal(app.state.redoStack.length,1);
  app.historySuppressDepth=0;app.pushAnimationPaintHistory('a',0);assert.equal(app.state.redoStack.length,0);
});

test('already aligned cels retain their canvas instead of allocating another full canvas at every stroke',()=>{
  const app=paintHistoryEditor(),cel=app.animationCel(app.activeAnimationLayer());
  cel.canvas.width=app.state.cageWidth;cel.canvas.height=app.state.cageHeight;
  const canvas=cel.canvas;app.makeMask=()=>{throw Error('Unexpected canvas allocation');};
  app.animationBakeCel(app.activeAnimationLayer(),0);assert.equal(cel.canvas,canvas);
});

test('blend modes default safely and survive independent history and project copies', async()=>{
  const app=editor();
  const layers=[{id:'a',name:'Overlay',blendMode:'multiply'},{id:'g',group:true},{id:'b',blendMode:'destination-out'},{id:'c',group:true,blendMode:'screen'}];
  const copy=app.cloneAnimationLayers(layers);
  assert.deepEqual(Array.from(copy,layer=>layer.blendMode),['multiply','pass-through','normal','screen']);
  layers[0].blendMode='normal';assert.equal(copy[0].blendMode,'multiply');
  const saved=app.serializeAnimationLayers(copy),restored=await app.restoreAnimationLayers(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(Array.from(restored,layer=>layer.blendMode),['multiply','pass-through','normal','screen']);
  assert.equal(app.animationBlendMode({blendMode:'pass-through'}),'normal');
});

test('changing a layer blend mode creates one history entry and leaves other layers untouched',()=>{
  const app=clipboardEditor();let history=0;app.pushHistory=()=>history++;
  assert.equal(app.setAnimationBlendMode('a','multiply'),true);
  assert.equal(app.state.animationLayers[0].blendMode,'multiply');
  assert.equal(app.animationBlendMode(app.state.animationLayers[1]),'normal');
  assert.equal(app.setAnimationBlendMode('a','multiply'),false);
  assert.equal(app.setAnimationBlendMode('a','destination-out'),false);
  assert.equal(app.setAnimationBlendMode('a','pass-through'),false);
  assert.equal(app.setAnimationBlendMode('missing','screen'),false);
  assert.equal(history,1);
});

test('copy and paste retain layer and group blend modes without baking them into source pixels',()=>{
  const app=clipboardEditor();app.state.selectedAnimationLayerIds=['a','b'];app.createAnimationGroup();
  const group=app.activeAnimationLayer();group.blendMode='screen';
  app.state.animationLayers.find(layer=>layer.id==='a').blendMode='multiply';
  app.copyAnimationLayers();app.pasteAnimationLayers();
  const pasted=app.activeAnimationLayer(),child=app.state.animationLayers.find(layer=>layer.parentId===pasted.id);
  assert.equal(pasted.blendMode,'screen');assert.equal(child.blendMode,'multiply');
  assert.notEqual(app.animationCel(child).canvas,app.state.frames[0].animationCels.a.canvas);
});

function blendRenderEditor() {
  const app=layeredEditor();
  const context=()=>({
    globalAlpha:1,globalCompositeOperation:'source-over',calls:[],stack:[],
    save(){this.stack.push([this.globalAlpha,this.globalCompositeOperation]);},
    restore(){[this.globalAlpha,this.globalCompositeOperation]=this.stack.pop();},
    drawImage(canvas){this.calls.push({canvas,mode:this.globalCompositeOperation,alpha:this.globalAlpha});}
  });
  app.makeMask=(width=64,height=64)=>{const canvas={width,height},t=context();canvas.getContext=()=>t;return canvas;};
  app.drawAnimationCel=(t,cel)=>{if(cel)t.drawImage(cel.canvas);};
  app.context=context;
  return app;
}

test('rendering applies each blend mode and opacity once and restores the caller context',()=>{
  const app=blendRenderEditor(),layers=app.state.animationLayers,target=app.context();
  layers[0].blendMode='multiply';layers[0].opacity=50;layers[1].blendMode='screen';
  app.drawAnimationLayers(target,layers,0,0,0);
  assert.deepEqual(target.calls.map(call=>[call.mode,call.alpha]),[['source-over',1],['screen',1],['multiply',.5]]);
  assert.equal(target.globalCompositeOperation,'source-over');assert.equal(target.globalAlpha,1);assert.equal(target.stack.length,0);
});

test('blended groups flatten overlapping children once while legacy groups remain pass-through',()=>{
  const app=blendRenderEditor();app.state.selectedAnimationLayerIds=['a','b'];app.createAnimationGroup();
  const group=app.activeAnimationLayer(),layers=app.state.animationLayers;
  layers.find(layer=>layer.id==='a').blendMode='screen';
  const direct=app.context();app.drawAnimationLayers(direct,layers,0,0,0);
  assert.deepEqual(direct.calls.map(call=>call.mode),['source-over','source-over','screen']);
  group.blendMode='multiply';group.opacity=50;
  const flattened=app.context();app.drawAnimationLayers(flattened,layers,0,0,0);
  assert.deepEqual(flattened.calls.map(call=>[call.mode,call.alpha]),[['source-over',1],['multiply',.5]]);
  const children=flattened.calls[1].canvas.getContext('2d');
  assert.deepEqual(children.calls.map(call=>[call.mode,call.alpha]),[['source-over',1],['screen',1]]);
  group.blendMode='normal';group.opacity=100;
  const isolated=app.context();app.drawAnimationLayers(isolated,layers,0,0,0);
  assert.equal(isolated.calls.length,2);assert.equal(isolated.calls[1].canvas.getContext('2d').calls.length,2);
});

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

test('pasting one sprite reuses an empty current cel and preserves the layer settings and other frames',()=>{
  const app=clipboardEditor(),layer=app.activeAnimationLayer(),other=app.animationCel(layer,1);
  layer.name='Empty destination';layer.opacity=60;layer.blendMode='screen';layer.spriteMask=true;
  app.animationCel(layer).canvas.empty=true;
  const source={canvas:{width:8,height:6,pixel:'pasted'},offsetX:7,offsetY:-3,flipX:true};let history=0;app.pushHistory=()=>history++;
  app.pasteAnimationLayers({width:64,height:64,records:[{id:'copied',name:'Source',visible:true,opacity:100,blendMode:'normal',cel:source}]});
  assert.equal(app.state.animationLayers.length,3);assert.equal(app.activeAnimationLayer().id,layer.id);
  assert.equal(layer.name,'Empty destination');assert.equal(layer.opacity,60);assert.equal(layer.blendMode,'screen');assert.equal(layer.spriteMask,true);
  const pasted=app.animationCel(layer);assert.equal(pasted.canvas.pixel,'pasted');assert.equal(pasted.offsetX,7);assert.equal(pasted.offsetY,-3);assert.equal(pasted.flipX,true);
  assert.notEqual(pasted.canvas,source.canvas);assert.equal(app.animationCel(layer,1),other);assert.equal(history,1);
  source.canvas.pixel='changed';assert.equal(pasted.canvas.pixel,'pasted');
});

test('a second paste adds a new layer once the destination contains pixels',()=>{
  const app=clipboardEditor(),layer=app.activeAnimationLayer();app.animationCel(layer).canvas.empty=true;
  const clip={width:64,height:64,records:[{id:'source',name:'Source',visible:true,cel:{canvas:{width:8,height:8,pixel:'art'},offsetX:0,offsetY:0}}]};
  app.pasteAnimationLayers(clip);assert.equal(app.state.animationLayers.length,3);
  app.pasteAnimationLayers(clip);assert.equal(app.state.animationLayers.length,4);assert.notEqual(app.activeAnimationLayer().id,layer.id);
  assert.equal(app.animationCel(layer).canvas.pixel,'art');
});

test('hidden, transparent-opacity, or masked artwork is occupied when choosing a paste destination',()=>{
  for(const change of [layer=>layer.visible=false,layer=>layer.opacity=0,layer=>layer.sharedCel={canvas:{width:8,height:8,pixel:'existing'},offsetX:0,offsetY:0}]){
    const app=clipboardEditor(),layer=app.activeAnimationLayer();change(layer);
    app.animationCel(layer).mask={width:16,height:16,covered:true};
    const before=app.animationCel(layer);
    app.pasteAnimationLayers({records:[{id:'source',name:'Source',visible:true,cel:{canvas:{width:8,height:8,pixel:'new'}}}]});
    assert.equal(app.state.animationLayers.length,4);assert.equal(app.animationCel(layer),before);
  }
});

test('empty shared layers keep their identity and render pasted pixels in every frame',()=>{
  const app=clipboardEditor(),layer=app.activeAnimationLayer();layer.sharedCel={canvas:{width:8,height:8,empty:true},offsetX:0,offsetY:0};
  const otherLocal=app.state.frames[1].animationCels.a;
  app.pasteAnimationLayers({records:[{id:'source',name:'Source',visible:true,cel:{canvas:{width:8,height:8,pixel:'shared'}}}]});
  assert.equal(app.state.animationLayers.length,3);assert.equal(app.activeAnimationLayer().id,layer.id);
  assert.equal(app.animationCel(layer,0).canvas.pixel,'shared');assert.equal(app.animationCel(layer,1),app.animationCel(layer,0));
  assert.equal(app.state.frames[1].animationCels.a,otherLocal);
});

test('empty base detection protects legacy drawing layers even when their visibility is off',()=>{
  const app=editor(),base=app.activeAnimationLayer();app.state.frames[0].canvas.empty=true;
  app.state.frames[0].pencilLayers=[{visible:false,canvas:{width:64,height:64,pixel:'legacy'}}];
  assert.equal(app.animationLayerIsEmpty(base),false);
  app.state.frames[0].pencilLayers[0].canvas.empty=true;assert.equal(app.animationLayerIsEmpty(base),true);
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

test('cut, copy, and paste keyboard shortcuts allow clipboard events and suppress held keys',()=>{
  const app=clipboardEditor();app.animationPanelActive=()=>true;let prevented=0;
  const press=(key,options={})=>app.handleAnimationKeyDown({key,preventDefault(){prevented++;},...options});
  assert.equal(press('c',{ctrlKey:true}),true);
  assert.equal(press('x',{ctrlKey:true}),true);
  assert.equal(press('v',{metaKey:true}),true);
  assert.equal(prevented,0);
  assert.equal(press('v',{ctrlKey:true,repeat:true}),true);
  assert.equal(press('x',{metaKey:true,repeat:true}),true);
  assert.equal(prevented,2);
  assert.equal(press('v',{ctrlKey:true,altKey:true}),false);
});

test('clipboard events paste layers and leave input clipboard events available for text',()=>{
  const app=clipboardEditor();
  app.animationPanelActive=()=>true;
  const clipboardData={ files: [], items: [], setData() {} };
  let prevented=0;
  const dispatch=(type,target)=>app.documentListeners[type]({ clipboardData, target, preventDefault(){ prevented++; } });
  dispatch('copy',{});
  dispatch('paste',{});
  assert.equal(app.state.animationLayers.length,4);
  const input={ closest(){ return this; } };
  dispatch('copy',input);
  dispatch('cut',input);
  dispatch('paste',input);
  assert.equal(app.state.animationLayers.length,4);
  assert.equal(prevented,2);
});

test('cutting a group transfers its current cels and leaves the other frames intact',()=>{
  const app=clipboardEditor();
  app.animationPanelActive=()=>true;
  app.state.indexedFrames=[];
  app.state.selectedAnimationLayerIds=['a','b'];
  app.createAnimationGroup();
  const layers=app.animationLayerList(), a=layers.find(layer=>layer.id==='a'), b=layers.find(layer=>layer.id==='b');
  const local=app.animationCel(a,0), other=app.animationCel(a,1);
  b.sharedCel=app.animationCel(b,0);
  local.canvas.pixel='red';
  b.sharedCel.canvas.pixel='blue';
  let history=0, clipboardEntry;
  app.pushHistory=()=>history++;
  app.documentListeners.cut({
    clipboardData:{setData(type,value){clipboardEntry=[type,value];}},
    target:{}, preventDefault(){}
  });
  assert.deepEqual(clipboardEntry,['application/x-spritesheet-editor','layers']);
  assert.equal(history,1);
  assert.equal(app.animationCel(a,0),null);
  assert.equal(app.animationCel(a,1),other);
  assert.equal(app.animationLayerVisible(b,0),false);
  assert.equal(app.animationLayerVisible(b,1),true);
  assert.equal(app.pasteAnimationLayers(),true);
  const pasted=app.activeAnimationLayer();
  const children=app.animationLayerList().filter(layer=>layer.parentId===pasted.id);
  assert.deepEqual(Array.from(children,layer=>app.animationCel(layer,0).canvas.pixel),['red','blue']);
  assert.equal(children.every(layer=>app.animationCel(layer,1)===null),true);
});

test('paste without copied artwork has no history or document changes',()=>{
  const app=clipboardEditor();let history=0;app.pushHistory=()=>history++;
  assert.equal(app.pasteAnimationLayers(),false);assert.equal(history,0);assert.equal(app.state.animationLayers.length,3);
});

function sourceFunction(name) {
  const html=fs.readFileSync(path.join(__dirname,'..','SpritesheetEditor.html'),'utf8'),start=html.indexOf(`    function ${name}(`);
  return html.slice(start,html.indexOf('\n    function ',start+1));
}

test('Ctrl/Cmd picks color during cell painting and is available for layer picking in Edit Image',()=>{
  const app=editor();app.state.pencilMode=true;
  vm.runInContext(sourceFunction('temporaryPencilColorPickerActive')+'\n'+sourceFunction('setPencilCtrlPickMode'),app);
  assert.equal(app.temporaryPencilColorPickerActive({ctrlKey:true}),true);
  app.setPencilCtrlPickMode(true);assert.equal(app.temporaryPencilColorPickerActive(),true);
  app.setPencilCtrlPickMode(false);assert.equal(app.temporaryPencilColorPickerActive(),false);
  app.animationPanelActive=()=>true;
  assert.equal(app.temporaryPencilColorPickerActive({ctrlKey:true}),false);
  app.setPencilCtrlPickMode(true);assert.equal(app.state.pencilCtrlPickMode,false);
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
  app.makeMask=(width=64,height=64)=>({width,height,getContext(){return {createImageData(w,h){return {width:w,height:h,data:new Uint8ClampedArray(w*h*4)};},putImageData(){}};}});
  app.pointerGuidePoint=e=>({x:e.clientX,y:e.clientY});app.pointerCagePoint=e=>({x:Math.floor(e.clientX),y:Math.floor(e.clientY)});
  app.pointerDelta=(e,x,y)=>({dx:e.clientX-x,dy:e.clientY-y});
  app.els={canvasShell:{classList:{add(){},remove(){},toggle(){}},setPointerCapture(){},hasPointerCapture(){return false;}}};
  return app;
}
test('rotation and scaling preserve source pixel values without creating antialiased edges', () => {
  const app = selectionEditor();
  const red = [255, 0, 0, 255], blue = [0, 0, 255, 128], clear = [0, 0, 0, 0];
  const source = {
    left: 5, top: 7,
    image: { width: 2, height: 2, data: new Uint8ClampedArray([...red, ...blue, ...clear, ...clear]) }
  };
  const pivot = { x: 6, y: 8 };
  const quarterTurn = app.transformAnimationPixels(source, pivot, Math.PI / 2);
  assert.deepEqual([quarterTurn.left, quarterTurn.top], [5, 7]);
  assert.deepEqual(Array.from(quarterTurn.image.data), [...clear, ...red, ...clear, ...blue]);
  const angled = app.transformAnimationPixels(source, pivot, Math.PI / 5).image.data;
  assert.ok(angled.some(value => value !== 0));
  for (let i = 0; i < angled.length; i += 4) {
    assert.ok([red, blue, clear].some(pixel => pixel.every((value, channel) => value === angled[i + channel])));
  }
  const scaled = app.transformAnimationPixels(source, pivot, 0, pivot, 2);
  assert.deepEqual([scaled.left, scaled.top, scaled.image.width, scaled.image.height], [4, 6, 4, 4]);
  const scaledRow = [...red, ...red, ...blue, ...blue];
  assert.deepEqual(Array.from(scaled.image.data), [...scaledRow, ...scaledRow, ...Array(32).fill(0)]);
});

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

test('plain selection arrows move only the outline and retain off-canvas selections',()=>{
  const app=selectionEditor();selectionDrag(app,[[2,2],[5,5]]);let history=0;app.pushHistory=()=>history++;
  const canvas=app.state.frames[0].canvas,offset=app.state.frameOffsets[0];
  app.handleAnimationKeyDown({key:'ArrowRight',preventDefault(){}});
  assert.equal(app.animationSelectionRaster().alpha[2*64+3],255);assert.equal(app.state.currentFrame,0);
  app.handleAnimationKeyDown({key:'ArrowDown',preventDefault(){}});
  assert.equal(app.animationSelectionRaster().alpha[3*64+3],255);
  app.moveAnimationSelection(-100,0);assert.equal(app.animationSelectionRaster().alpha.some(value=>value),false);
  app.moveAnimationSelection(100,0);assert.equal(app.animationSelectionRaster().alpha.filter(value=>value).length,9);
  assert.equal(app.state.frames[0].canvas,canvas);assert.equal(app.state.frameOffsets[0],offset);assert.equal(history,4);
});

test('Shift+Arrows nudge the selected pixels by 10 pixels across Edit Image tools', () => {
  const app = selectionEditor();
  selectionDrag(app, [[2, 2], [5, 5]]);
  const moves = [];
  app.nudgeAnimationSelectedPixels = (dx, dy) => moves.push([dx, dy]);
  for (const [tool, key] of [['rectangle', 'ArrowRight'], ['move', 'ArrowDown'], ['pencil', 'ArrowLeft']]) {
    app.state.animationTool = tool;
    assert.equal(app.handleAnimationKeyDown({ key, shiftKey: true, preventDefault() {} }), true);
  }
  assert.deepEqual(moves, [[10, 0], [0, 10], [-10, 0]]);
});

function selectionHistoryEditor(tool='rectangle') {
  const app=selectionEditor(tool);
  Object.assign(app.state,{undoStack:[],redoStack:[],selectedAnimationLayerIds:[]});
  app.historySuppressDepth=0;app.finishKeyboardNudge=()=>{};
  app.snapshot=()=>({currentFrame:app.state.currentFrame,activeAnimationLayerId:app.state.activeAnimationLayerId,
    animationSelectionHistory:app.animationSelectionHistoryState()});
  app.restore=saved=>{
    app.resetAnimationTools();app.state.currentFrame=saved.currentFrame;app.state.activeAnimationLayerId=saved.activeAnimationLayerId;
    app.restoreAnimationSelectionHistory(saved.animationSelectionHistory);
  };
  for(const name of ['syncHistoryButtons','pushHistory','cancelActiveDrag','undo','redo'])vm.runInContext(sourceFunction(name),app);
  return app;
}

test('Undo and Redo restore successive rectangle and lasso selections and the active tool',()=>{
  for(const tool of ['rectangle','lasso']) {
    const app=selectionHistoryEditor(tool),shape=(x,y)=>tool==='rectangle'?[[x,y],[x+4,y+4]]:[[x,y],[x+4,y],[x+4,y+4],[x,y+4]];
    const first=Array.from(selectionDrag(app,shape(2,2))),second=Array.from(selectionDrag(app,shape(20,20)));
    assert.equal(app.state.undoStack.length,2);
    app.undo();assert.deepEqual(Array.from(app.animationSelectionRaster().alpha),first);assert.equal(app.state.animationTool,tool);
    app.redo();assert.deepEqual(Array.from(app.animationSelectionRaster().alpha),second);
    app.undo();app.undo();assert.equal(app.validAnimationSelection(),null);
    app.redo();assert.deepEqual(Array.from(app.animationSelectionRaster().alpha),first);
    app.redo();assert.deepEqual(Array.from(app.animationSelectionRaster().alpha),second);
  }
});

test('Undo restores exact masks before Shift additions, Alt subtractions, movement, and clearing',()=>{
  const app=selectionHistoryEditor(),masks=[];
  masks.push(Array.from(selectionDrag(app,[[2,2],[10,10]])));
  masks.push(Array.from(selectionDrag(app,[[12,2],[15,5]],{shiftKey:true})));
  masks.push(Array.from(selectionDrag(app,[[4,4],[6,6]],{altKey:true})));
  masks.push(Array.from(selectionDrag(app,[[3,3],[4,5]])));
  app.handleAnimationKeyDown({key:'ArrowRight',preventDefault(){}});masks.push(Array.from(app.animationSelectionRaster().alpha));
  app.handleAnimationKeyDown({key:'Escape',preventDefault(){}});assert.equal(app.validAnimationSelection(),null);
  for(const mask of masks.reverse()) {app.undo();assert.deepEqual(Array.from(app.animationSelectionRaster().alpha),mask);}
  app.undo();assert.equal(app.validAnimationSelection(),null);
  for(const mask of masks.reverse()) {app.redo();assert.deepEqual(Array.from(app.animationSelectionRaster().alpha),mask);}
  app.redo();assert.equal(app.validAnimationSelection(),null);assert.equal(app.state.animationTool,'move');
});

test('Ctrl/Cmd+A selects the full cage, keeps the active tool, and supports Undo', () => {
  const app = selectionHistoryEditor('pencil');
  const modal = { classList: { contains() { return false; }, toggle() {} } };
  app.colorPicker = { pickMode: false };
  app.els = new Proxy({}, { get() { return modal; } });
  app.canvasContentAvailable = () => true;
  app.spriteSheetBuilderPreviewHovered = () => false;
  app.spriteSheetBuilderTimelineAvailable = () => false;
  app.selectSpriteSheetBuilderFrameFromNumberKey = () => false;
  app.document.addEventListener = (_type, handler) => { app.keydown = handler; };
  const html = fs.readFileSync(path.join(__dirname, '..', 'SpritesheetEditor.html'), 'utf8');
  const start = html.indexOf("    document.addEventListener('keydown', e => {");
  vm.runInContext(html.slice(start, html.indexOf("    document.addEventListener('keyup', e => {", start)), app);
  let prevented = 0;
  const press = (tagName, modifiers) => {
    app.document.activeElement = { tagName };
    app.keydown({ key: 'a', preventDefault() { prevented++; }, ...modifiers });
  };

  press('INPUT', { ctrlKey: true });
  assert.equal(prevented, 0);
  assert.equal(app.validAnimationSelection(), null);
  press('CANVAS', { ctrlKey: true });
  assert.equal(prevented, 1);
  assert.equal(app.state.animationTool, 'pencil');
  const { alpha } = app.animationSelectionRaster();
  assert.equal(alpha.length, 64 * 64);
  assert.ok(alpha.every(value => value === 255));
  press('CANVAS', { metaKey: true });
  assert.equal(prevented, 2);
  assert.equal(app.state.undoStack.length, 1);
  app.undo();
  assert.equal(app.validAnimationSelection(), null);
});

test('Ctrl/Cmd+D clears the pixel selection without changing the active tool', () => {
  const app = selectionHistoryEditor();
  const mask = Array.from(selectionDrag(app, [[2, 2], [10, 10]]));
  let prevented = 0;
  const press = modifiers => app.handleAnimationKeyDown({key: 'd', preventDefault() { prevented++; }, ...modifiers});

  assert.equal(press({ctrlKey: true, shiftKey: true}), false);
  assert.equal(press({ctrlKey: true}), true);
  assert.equal(app.validAnimationSelection(), null);
  assert.equal(app.state.animationTool, 'rectangle');
  assert.equal(press({ctrlKey: true, repeat: true}), true);
  assert.equal(app.state.undoStack.length, 2);
  app.undo();
  assert.deepEqual(Array.from(app.animationSelectionRaster().alpha), mask);
  assert.equal(press({metaKey: true}), true);
  assert.equal(app.validAnimationSelection(), null);
  assert.equal(prevented, 3);
});

test('canceled and unchanged selection drags preserve Undo and Redo history',()=>{
  const app=selectionHistoryEditor();selectionDrag(app,[[2,2],[10,10]]);selectionDrag(app,[[20,20],[25,25]]);app.undo();
  const before=Array.from(app.animationSelectionRaster().alpha),undoCount=app.state.undoStack.length;
  app.startAnimationCanvasDrag({clientX:30,clientY:30,pointerId:1});app.moveAnimationCanvasDrag({clientX:35,clientY:35});
  app.finishAnimationCanvasDrag({type:'pointercancel',pointerId:1});
  assert.deepEqual(Array.from(app.animationSelectionRaster().alpha),before);
  selectionDrag(app,[[4,4],[6,6]],{shiftKey:true});
  selectionDrag(app,[[3,3],[3,3]]);
  assert.equal(app.state.undoStack.length,undoCount);assert.equal(app.state.redoStack.length,1);
  app.redo();assert.equal(app.animationSelectionRaster().alpha[20*64+20],255);
});

test('history masks are independent on capture and restore, including geometry and boolean operands',()=>{
  const app=selectionHistoryEditor();selectionDrag(app,[[2,2],[10,10]]);
  const saved=app.animationSelectionHistoryState();saved.selection.alpha.fill(0);
  assert.equal(app.animationSelectionRaster().alpha.filter(Boolean).length,64);
  const original=app.animationSelectionHistoryState();app.restoreAnimationSelectionHistory(original);original.selection.alpha.fill(0);
  assert.equal(app.animationSelectionRaster().alpha.filter(Boolean).length,64);
  const shape={kind:'lasso',points:[{x:1,y:2}],addTo:new Uint8Array([255]),subtractFrom:new Uint8Array([0])};
  const copy=app.cloneAnimationSelection(shape);shape.points[0].x=7;shape.addTo[0]=0;shape.subtractFrom[0]=255;
  assert.equal(copy.points[0].x,1);assert.equal(copy.addTo[0],255);assert.equal(copy.subtractFrom[0],0);
});

test('Undo during an unfinished selection cancels the gesture before recording Redo',()=>{
  const app=selectionHistoryEditor();const first=Array.from(selectionDrag(app,[[2,2],[6,6]]));
  app.startAnimationCanvasDrag({clientX:20,clientY:20,pointerId:1});app.moveAnimationCanvasDrag({clientX:30,clientY:30});
  app.undo();assert.equal(app.validAnimationSelection(),null);assert.equal(app.state.dragging,false);
  app.redo();assert.deepEqual(Array.from(app.animationSelectionRaster().alpha),first);
});

test('switching layers and frames retains the cage selection and erases only the current cel',()=>{
  for(const tool of ['rectangle','lasso']) {
    const app=selectionEditor(tool),layers=layeredEditor();app.state.animationLayers=layers.state.animationLayers;app.state.frames=layers.state.frames;
    app.state.activeAnimationLayerId='a';app.state.indexedFrames=[];
    const shape=tool==='rectangle'?[[2,2],[6,6]]:[[2,2],[6,2],[6,6],[2,6]],mask=Array.from(selectionDrag(app,shape)),erased=[];
    app.state.frames[0].animationCels.a.canvas.getContext=()=>{throw Error('wrong layer erased');};
    app.state.frames[0].animationCels.b.canvas.getContext=()=>({save(){},restore(){},drawImage(){erased.push('b');}});
    app.animationLocalMask=mask=>mask;
    app.selectAnimationLayer('b');assert.equal(app.state.animationTool,tool);
    assert.deepEqual(Array.from(app.animationSelectionRaster().alpha),mask);
    assert.equal(app.eraseAnimationSelection(),true);assert.deepEqual(erased,['b']);
    app.state.currentFrame=1;assert.equal(app.validAnimationSelection(),true);
    assert.deepEqual(Array.from(app.animationSelectionRaster().alpha),mask);
    app.state.frames[1].animationCels.b.canvas.getContext=()=>({save(){},restore(){},drawImage(){erased.push('b-1');}});
    assert.equal(app.eraseAnimationSelection(),true);assert.deepEqual(erased,['b','b-1']);
  }
});

test('selection geometry and its cached clip survive arbitrary frame changes without adding history',()=>{
  const app=selectionHistoryEditor('lasso');
  selectionDrag(app,[[2,2],[10,2],[8,9],[2,7]]);
  const raster=app.animationSelectionRaster(),mask=Array.from(raster.alpha),history=app.state.undoStack.length;
  app.state.frames.push({id:'third-frame',canvas:{width:64,height:64}});
  for(const frame of [1,2,0,2,1,0]){
    app.state.currentFrame=frame;
    assert.equal(app.validAnimationSelection(),true);assert.equal(app.animationSelectionRaster(),raster);
    assert.deepEqual(Array.from(app.animationSelectionRaster().alpha),mask);
    assert.ok(app.animationSelectionHistoryState().selection);
  }
  assert.equal(app.state.undoStack.length,history);
});

test('selection clearing and Undo on another frame retain independent mask history',()=>{
  const app=selectionHistoryEditor();const alpha=Array.from(selectionDrag(app,[[2,2],[7,8]]));
  app.state.currentFrame=1;app.clearAnimationSelection();assert.equal(app.validAnimationSelection(),null);
  app.undo();assert.equal(app.state.currentFrame,1);assert.deepEqual(Array.from(app.animationSelectionRaster().alpha),alpha);
  app.redo();assert.equal(app.validAnimationSelection(),null);
});

test('switching Animation tools retains the same frame selection',()=>{
  const app=selectionEditor();const mask=Array.from(selectionDrag(app,[[2,2],[6,6]]));
  app.clearActiveCanvasTools=()=>app.resetAnimationTools();
  for(const tool of ['lasso','rectangle','move','pencil','eraser','dropper']) {
    app.setAnimationTool(tool);assert.deepEqual(Array.from(app.animationSelectionRaster().alpha),mask);
  }
});

test('lasso cursor modifiers follow Shift/Alt and reset, with subtraction taking precedence',()=>{
  const app=editor(),flags={};app.els={canvasShell:{classList:{toggle(name,on){flags[name]=on;}}}};
  app.updateAnimationSelectionCursor({shiftKey:true,altKey:false});assert.equal(flags['animation-lasso-add'],true);assert.equal(flags['animation-lasso-subtract'],false);
  app.updateAnimationSelectionCursor({shiftKey:true,altKey:true});assert.equal(flags['animation-lasso-add'],false);assert.equal(flags['animation-lasso-subtract'],true);
  app.updateAnimationSelectionCursor({shiftKey:false,altKey:true});assert.equal(flags['animation-lasso-subtract'],true);
  app.updateAnimationSelectionCursor({shiftKey:false,altKey:false});assert.equal(flags['animation-lasso-add'],false);assert.equal(flags['animation-lasso-subtract'],false);
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
  assert.equal(history,1);history=0;
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

test('Shift + Wheel sizes either Edit Image brush without zooming or changing the shared brush size', () => {
  for (const tool of ['pencil', 'eraser']) {
    const app = wheelEditor(tool);
    app.scroll(-200);
    assert.equal(app.state.animationBrushSize, 16);
    app.scroll(100);
    assert.equal(app.state.animationBrushSize, 15);
    assert.equal(app.state.brushSize, 30);
    assert.equal(app.state.zoom, 3);
    app.state.animationBrushSize = 50; app.scroll(-100);
    assert.equal(app.state.animationBrushSize, 50);
    app.state.animationBrushSize = 1; app.scroll(100);
    assert.equal(app.state.animationBrushSize, 1);
  }
});

test('Shared brush sizing and normal canvas zoom keep their existing behavior', () => {
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

test('Shift+H toggles selected layer visibility only in the current frame with one Undo entry',()=>{
  const app=layeredEditor();app.animationPanelActive=()=>true;app.state.selectedAnimationLayerIds=['a','b'];
  let history=0,prevented=0;app.pushHistory=()=>history++;
  const press=extra=>app.handleAnimationKeyDown({key:'H',shiftKey:true,preventDefault(){prevented++;},...extra});
  assert.equal(press(),true);
  assert.equal(app.animationLayerOwnVisible(app.state.animationLayers[0],0),false);
  assert.equal(app.animationLayerOwnVisible(app.state.animationLayers[1],0),false);
  assert.equal(app.animationLayerOwnVisible(app.state.animationLayers[0],1),true);
  assert.equal(app.animationLayerOwnVisible(app.state.animationLayers[2],0),true);
  press({repeat:true});assert.equal(history,1);
  press();assert.equal(history,2);assert.equal(prevented,3);
  assert.equal(app.animationLayerOwnVisible(app.state.animationLayers[0],0),true);
});

test('selected group visibility toggles its root without changing selected children own visibility',()=>{
  const app=layeredEditor();app.state.selectedAnimationLayerIds=['a','b'];app.createAnimationGroup();
  const group=app.activeAnimationLayer();app.state.selectedAnimationLayerIds=[group.id,'a'];app.toggleSelectedAnimationVisibility();
  const child=app.state.animationLayers.find(layer=>layer.id==='a');
  assert.equal(app.animationLayerVisible(child,0),false);assert.equal(app.animationLayerOwnVisible(child,0),true);
  app.toggleSelectedAnimationVisibility();assert.equal(app.animationLayerVisible(child,0),true);
});

test('Ctrl+E merges a single layer down and retains independent frame artwork and other layers',()=>{
  const app=mergeEditor();app.animationPanelActive=()=>true;let history=0;app.pushHistory=()=>history++;
  app.handleAnimationKeyDown({key:'e',ctrlKey:true,preventDefault(){}});
  const merged=app.activeAnimationLayer();
  assert.deepEqual(app.animationCel(merged,0).canvas.drawn,['b-0','a-0']);
  assert.deepEqual(app.animationCel(merged,1).canvas.drawn,['b-1','a-1']);
  assert.deepEqual(Array.from(app.state.animationLayers,layer=>layer.id),[merged.id,'c']);assert.equal(history,1);
});

test('Ctrl+E merges multiple selected layers without implicitly adding the layer below',()=>{
  const app=mergeEditor();app.animationPanelActive=()=>true;app.state.selectedAnimationLayerIds=['a','c'];
  let selectedAtHistory;app.pushHistory=()=>selectedAtHistory=[...app.state.selectedAnimationLayerIds];
  app.handleAnimationKeyDown({key:'e',metaKey:true,preventDefault(){}});
  assert.deepEqual(selectedAtHistory,['a','c']);
  assert.deepEqual(app.animationCel(app.activeAnimationLayer()).canvas.drawn,['c-0','a-0']);
  assert.equal(app.state.animationLayers[1].id,'b');
});

test('merge down stops at the bottom sibling and never consumes a layer outside the group',()=>{
  const app=mergeEditor();app.state.selectedAnimationLayerIds=['a','b'];app.createAnimationGroup();
  app.selectAnimationLayer('b');let history=0;app.pushHistory=()=>history++;
  assert.equal(app.mergeAnimationLayerSelection(),false);assert.equal(history,0);
  app.selectAnimationLayer('a');assert.equal(app.mergeAnimationLayerSelection(),true);
  assert.equal(app.activeAnimationLayer().parentId,app.state.animationLayers[0].id);
  assert.equal(app.state.animationLayers.at(-1).id,'c');
});

test('Ctrl+Shift+E merges every layer including artwork that exists only in another frame',()=>{
  const app=mergeEditor();app.animationPanelActive=()=>true;delete app.state.frames[0].animationCels.c;
  let history=0;app.pushHistory=()=>history++;
  assert.equal(app.handleAnimationKeyDown({key:'E',ctrlKey:true,shiftKey:true,preventDefault(){}}),true);
  const merged=app.activeAnimationLayer();assert.equal(app.state.animationLayers.length,1);
  assert.deepEqual(app.animationCel(merged,0).canvas.drawn,['b-0','a-0']);
  assert.deepEqual(app.animationCel(merged,1).canvas.drawn,['c-1','b-1','a-1']);assert.equal(history,1);
});

test('layer shortcuts ignore typing, other panels, key repeats, and active drags',()=>{
  const app=mergeEditor();app.animationPanelActive=()=>true;let history=0,prevented=0;app.pushHistory=()=>history++;
  const press=extra=>app.handleAnimationKeyDown({key:'e',ctrlKey:true,preventDefault(){prevented++;},...extra});
  assert.equal(press({target:{closest(){return this;}}}),false);
  assert.equal(press({target:{isContentEditable:true}}),false);
  app.animationPanelActive=()=>false;assert.equal(press(),false);app.animationPanelActive=()=>true;
  assert.equal(press({repeat:true}),true);app.state.dragging=true;assert.equal(press(),true);
  assert.equal(history,0);assert.equal(prevented,2);
});

test('Ctrl+E during an unfinished transform suppresses browser search without merging the preview',()=>{
  const app=mergeEditor();app.activeAnimationTransform=()=>({mode:'rotate'});let prevented=0;
  assert.equal(app.handleAnimationTransformKeyDown({key:'E',ctrlKey:true,shiftKey:true,preventDefault(){prevented++;}},false),true);
  assert.equal(prevented,1);assert.equal(app.state.animationLayers.length,3);
});

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

test('Merge retains the outer blend mode when flattening a single group',()=>{
  const app=blendRenderEditor();app.state.selectedAnimationLayerIds=['a','b'];app.createAnimationGroup();
  app.activeAnimationLayer().blendMode='multiply';
  app.mergeAnimationLayers();
  assert.equal(app.activeAnimationLayer().blendMode,'multiply');
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

test('New Layer keeps the active tool and inserts independent empty cels above the selected layer', () => {
  const app=editor();
  app.state.animationTool='pencil';
  app.createEmptyAnimationLayer();
  assert.equal(app.state.animationTool,'pencil');
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
    app.paintAnimationStroke({layerId:group.id,frame:0,tool,last:{x:0,y:0},points:[{x:5,y:5}]});
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

test('removing a group removes its current-frame contents and preserves other frames', () => {
  const app=layeredEditor();app.state.selectedAnimationLayerIds=['a','b'];app.createAnimationGroup();
  const group=app.activeAnimationLayer(), other=app.state.frames[1].animationCels;
  app.removeAnimationLayer(group.id);
  assert.deepEqual(Array.from(app.animationFrameLayers(),layer=>layer.id),['c']);
  assert.equal(app.state.frames[0].animationCels.a,undefined);
  assert.equal(app.state.frames[0].animationCels.b,undefined);
  assert.ok(app.state.frames[0].animationCels.c);
  assert.equal(app.animationLayerVisible(group,0),false);
  assert.equal(app.animationLayerVisible(group,1),true);
  assert.equal(app.animationCel(app.state.animationLayers.find(layer=>layer.id==='a'),1),other.a);
  assert.equal(app.animationCel(app.state.animationLayers.find(layer=>layer.id==='b'),1),other.b);
  assert.deepEqual(Array.from(app.animationFrameLayers(1),layer=>layer.id),[group.id,'a','b','c']);
  app.state.currentFrame=1;app.removeAnimationLayer(group.id);
  assert.deepEqual(Array.from(app.state.animationLayers,layer=>layer.id),['c']);
});

test('deleting the original GIF layer preserves its source artwork in other frames', () => {
  const app=editor();app.updateAnimationUi=()=>{};
  const layer=app.activeAnimationLayer(), originals=app.state.frames.map(frame=>frame.canvas);
  let history=0;app.pushHistory=()=>history++;
  app.removeAnimationLayer(layer.id);
  assert.equal(history,1);
  assert.equal(app.animationCel(layer,0),null);
  assert.equal(app.animationLayerVisible(layer,0),false);
  assert.equal(app.animationCel(layer,1).canvas,originals[1]);
  assert.equal(app.state.frames[0].canvas,originals[0]);
  assert.equal(app.animationFrameLayers().length,0);
  assert.equal(app.activeAnimationLayer(),null);
  const drawn=[];app.drawBaseSprite=(_target,i)=>drawn.push(i);
  const target={save(){},beginPath(){},rect(){},clip(){},restore(){},drawImage(){}};
  app.drawAnimationSprite(target,0,0,0,{});
  app.drawAnimationSprite(target,1,0,0,{});
  assert.deepEqual(drawn,[1]);
  app.state.currentFrame=1;app.removeAnimationLayer(layer.id);
  assert.equal(app.state.animationLayers.length,0);
});

test('deleting shared artwork excludes only the current frame without mutating the shared cel', () => {
  const app=clipboardEditor(), layer=app.activeAnimationLayer();
  layer.sharedCel=app.state.frames[0].animationCels.a;
  layer.sharedCel.canvas.pixel='red';
  const shared=layer.sharedCel, other=app.state.frames[1].animationCels.a;
  app.removeAnimationLayer(layer.id);
  assert.equal(app.animationCel(layer,0),null);
  assert.equal(app.animationCel(layer,1),shared);
  assert.equal(app.animationLayerVisible(layer,1),true);
  assert.equal(shared.canvas.pixel,'red');
  assert.equal(app.state.frames[1].animationCels.a,other);
  assert.equal(app.activeAnimationLayer().id,'b');
  assert.deepEqual(Array.from(app.animationFrameLayers(1),layer=>layer.id),['a','b','c']);
});

test('removing frame-local artwork prunes unused metadata and repeated removal is a no-op', () => {
  const app=clipboardEditor();delete app.state.frames[1].animationCels.a;
  let history=0;app.pushHistory=()=>history++;
  app.removeAnimationLayer('a');app.removeAnimationLayer('a');
  assert.equal(history,1);
  assert.deepEqual(Array.from(app.state.animationLayers,layer=>layer.id),['b','c']);
  assert.equal(app.state.frames[0].animationRemovedLayers.a,undefined);
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
