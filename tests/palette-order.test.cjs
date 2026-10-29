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
const color = (name, r, g, b, a = 255) => ({ name, r, g, b, a });
const palette = [color('red',255,0,0), color('white',255,255,255), color('blue',0,0,255),
  color('clear',0,0,0,0), color('green',0,255,0), color('black',0,0,0)];
function editor() {
  const app = { state: { frames: [{},{}], indexedFrames: [], currentFrame: 0, indexColors: 3, paletteLayers: [], importedPaletteRevision: 0 },
    clamp: (v,min,max) => Math.max(min,Math.min(max,v)),
    els: { indexColorsInput: {value:3} }, hasFrames:()=>true, clearIndexPreviewCache() {},
    pushHistory() {}, showError() {}, buildFilmstrip() {}, drawFrame() {}, updateInfo() {}, markFrameBitmapsDirty() {}, reanchorGeneratedPaletteState() {},
    resetPaletteAdjustment() {}, uploadedPaletteSourceKey:()=>'', normalizePaletteAdjust:value=>value, palettesMatch:()=>false,
    normalizeIndexList:values=>values, adjustPaletteLayerColor:color=>({r:color.r,g:color.g,b:color.b,a:color.a})
  };
  vm.createContext(app);
  for(const name of ['clonePalette','cloneColor','cloneImportedPaletteInfo','colorDistanceSq','rgbToHsv','orderedPaletteColors',
    'basePaletteInfoForEditing','defaultPaletteLayer','ensureDefaultPaletteLayer','paletteInfoFromPalette','setSharedPaletteInfo',
    'clearPaletteLayerState','paletteInfoForApply','indexAllFrames','bakeViewedColorTableAll','reorderColorTable',
    'paletteLayerBase','paletteLayerSelectedIndices','paletteLayerPreviewInfo','paletteWithEditedSlot'])vm.runInContext(sourceFunction(name),app);
  return app;
}
const names = colors => Array.from(colors, item => item.name);

test('light/dark and hue ordering use predictable color values and retain transparency',()=>{
  const app=editor();
  assert.deepEqual(names(app.orderedPaletteColors(palette,'light-dark')),['clear','black','blue','red','green','white']);
  assert.deepEqual(names(app.orderedPaletteColors(palette,'dark-light')),['clear','white','green','red','blue','black']);
  assert.deepEqual(names(app.orderedPaletteColors(palette,'hue')),['clear','black','white','red','green','blue']);
});

test('color similarity keeps neighboring shades together',()=>{
  const app=editor(),colors=[color('red',255,0,0),color('dark blue',0,0,200),color('dark red',200,0,0),color('blue',0,0,255)];
  assert.deepEqual(names(app.orderedPaletteColors(colors,'similarity')),['dark blue','blue','dark red','red']);
});

test('Original index order restores the original table after multiple sorts and serialization',()=>{
  const app=editor();let colors=app.orderedPaletteColors(palette,'hue');colors=app.orderedPaletteColors(colors,'reverse');
  const saved=app.cloneImportedPaletteInfo(JSON.parse(JSON.stringify({palette:colors,colorLimit:6,keepTransparency:true})));
  assert.deepEqual(names(app.orderedPaletteColors(saved.palette,'original')),names(palette));
});

test('palette preview and slot editing preserve the original index metadata used by Bake All',()=>{
  const app=editor(),sorted=app.orderedPaletteColors(palette,'reverse');app.ensureDefaultPaletteLayer(sorted);
  const layer=app.defaultPaletteLayer(),preview=app.paletteLayerPreviewInfo(layer,{palette:sorted,colorLimit:6});
  assert.deepEqual(Array.from(preview.nextPalette,c=>c.originalIndex),[5,4,3,2,1,0]);
  assert.deepEqual(names(app.orderedPaletteColors(preview.nextPalette,'original')),names(palette));
  const edited=app.paletteWithEditedSlot(preview.nextPalette,0,{r:10,g:20,b:30,a:255});
  assert.equal(edited[0].originalIndex,5);assert.equal(edited[0].r,10);
});

test('all six orders preserve color count, RGBA values, and the input table',()=>{
  const app=editor(),before=JSON.stringify(palette),rgba=colors=>Array.from(colors,c=>[c.r,c.g,c.b,c.a].join(',')).sort();
  for(const mode of ['original','similarity','light-dark','dark-light','hue','reverse']) {
    const sorted=app.orderedPaletteColors(palette,mode);assert.equal(sorted.length,palette.length);assert.deepEqual(rgba(sorted),rgba(palette));
  }
  assert.equal(JSON.stringify(palette),before);
  assert.deepEqual(names(app.orderedPaletteColors(app.orderedPaletteColors(palette,'reverse'),'reverse')),names(palette));
});

test('a reduced preview seeds the new default palette instead of the previously applied table',()=>{
  const app=editor(),reduced=palette.slice(0,3);app.state.indexedFrames=[{palette,colorLimit:6}];
  app.displayedPaletteInfo=()=>({mode:'preview',palette:reduced,colorLimit:3,keepTransparency:true});
  const base=app.basePaletteInfoForEditing();app.ensureDefaultPaletteLayer(base.palette,base.sourceKey);
  assert.equal(app.defaultPaletteLayer().palette.length,3);assert.equal(base.colorLimit,3);
});

test('existing palette layers keep their base table while previewing color adjustments',()=>{
  const app=editor();app.state.indexedFrames=[{palette,colorLimit:6}];app.ensureDefaultPaletteLayer(palette);
  app.displayedPaletteInfo=()=>({mode:'preview',palette:palette.slice().reverse(),colorLimit:6});
  assert.equal(app.basePaletteInfoForEditing().palette,palette);
});

test('Re-Order and Bake All retain the reduced count and palette on every frame',()=>{
  const app=editor(),reduced=palette.slice(0,3);
  app.displayedPaletteInfo=()=>({mode:'preview',palette:reduced,colorLimit:3,keepTransparency:true});
  app.buildFrameIndexResult=(_i,info)=>({...info,imageData:{}});app.applyIndexedResultToFrame=(i,result)=>{app.state.indexedFrames[i]=result;};
  app.activePaletteLayerHasPendingChanges=()=>false;
  app.reorderColorTable('hue');assert.equal(app.state.indexColors,3);assert.equal(app.state.importedPaletteInfo.palette.length,3);
  app.bakeViewedColorTableAll();assert.equal(app.state.indexColors,3);assert.equal(app.els.indexColorsInput.value,3);
  assert.deepEqual(Array.from(app.state.indexedFrames,result=>result.palette.length),[3,3]);
});
