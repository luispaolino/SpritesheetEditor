const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const html = fs.readFileSync(path.join(__dirname, '..', 'SpritesheetEditor.html'), 'utf8');
function sourceFunction(name) {
  const start = html.indexOf(`    function ${name}(`);
  assert.notEqual(start, -1, `Missing function ${name}`);
  return html.slice(start, html.indexOf('\n    function ', start + 1));
}
function editor(skipped = [], options = {}) {
  const rendered = [], errors = [];
  const app = {
    state: { frames: Array.from({ length: 7 }, (_, i) => ({ skipped: skipped.includes(i) })),
      startFrame: 0, endFrame: 6, currentFrame: 0, fps: 10, playing: false, lastTick: 0,
      playbackDirection: 1, pingPongAnimation: false, loopPlayback: true, ...options },
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    spriteSheetBuilderTimelineAvailable: () => false,
    tickReferenceCompositorPlayback: () => false,
    syncReferenceCompositorAudio() {}, syncReferenceAnimationState() {}, updateInfo() {}, startAnimationLoop() {},
    syncPlaybackUi() {}, cancelAnimationLoopIfIdle() {},
    drawFrame: index => rendered.push(index), showError: message => errors.push(message),
    rendered, errors
  };
  app.hasFrames = () => app.state.frames.length > 0;
  app.frameIsSkipped = i => !!app.state.frames[i]?.skipped;
  app.animationLoopActive = () => app.state.playing;
  vm.createContext(app);
  for (const name of ['playbackFrameIndices', 'playbackRangeBounds', 'playbackFrameDurationMs',
    'nextPlaybackSourcePosition', 'playbackAdvanceWouldEnd', 'nextPlaybackAdvance',
    'alignCurrentPlaybackFrame', 'playLoop', 'play', 'pause']) {
    vm.runInContext(sourceFunction(name), app);
  }
  return app;
}
function next(app) {
  const result = app.nextPlaybackAdvance();
  assert.equal(result.delayMs, 1000 / app.state.fps);
  if (!result.ended) { app.state.currentFrame = result.frame; app.state.playbackDirection = result.direction; }
  return result;
}

test('consecutive skipped frames take no additional playback time', () => {
  const app = editor([1, 2, 3, 5]);
  assert.deepEqual([next(app).frame, next(app).frame, next(app).frame], [4, 6, 0]);
});

test('skipped first and last frames add no pause when looping', () => {
  const app = editor([0, 1, 5, 6], { currentFrame: 2 });
  assert.deepEqual([next(app).frame, next(app).frame, next(app).frame], [3, 4, 2]);
});

test('ping-pong reverses at playable endpoints without holding them twice', () => {
  const app = editor([0, 2, 4, 6], { currentFrame: 1, pingPongAnimation: true });
  assert.deepEqual(Array.from({ length: 8 }, () => next(app).frame), [3, 5, 3, 1, 3, 5, 3, 1]);
});

test('the playback range still excludes non-skipped frames outside its limits', () => {
  const app = editor([2, 4], { startFrame: 1, endFrame: 5, currentFrame: 1 });
  assert.deepEqual([next(app).frame, next(app).frame, next(app).frame], [3, 5, 1]);
});

test('one-shot playback ends after one interval on the final playable frame', () => {
  const app = editor([1, 3, 5, 6], { loopPlayback: false });
  assert.equal(next(app).frame, 2); assert.equal(next(app).frame, 4);
  const end = next(app); assert.equal(end.ended, true); assert.equal(end.frame, 4);
});

test('single playable frames hold normally in looping and one-shot playback', () => {
  for (const pingPongAnimation of [false, true]) {
    for (const loopPlayback of [false, true]) {
      const app = editor([0, 1, 2, 4, 5, 6], { currentFrame: 3, pingPongAnimation, loopPlayback });
      const result = next(app); assert.equal(result.frame, 3); assert.equal(!!result.ended, !loopPlayback);
    }
  }
});

test('Play aligns a skipped selection and resets direction at the first playable frame', () => {
  const app = editor([0, 2, 6], { pingPongAnimation: true, loopPlayback: false, playbackDirection: -1 });
  app.play(); assert.equal(app.state.currentFrame, 1); assert.equal(app.state.playbackDirection, 1);
  assert.equal(app.state.playing, true); assert.equal(next(app).frame, 3);
});

test('all skipped frames prevent Play and terminate an in-flight advance', () => {
  const app = editor([0, 1, 2, 3, 4, 5, 6]);
  app.play(); assert.equal(app.state.playing, false); assert.match(app.errors[0], /All frames/);
  assert.equal(next(app).ended, true);
});

test('the animation loop advances on consecutive frame intervals across skipped blocks', () => {
  const app = editor([1, 2, 3, 5]); app.play(); app.playLoop(1000);
  app.playLoop(1099); assert.equal(app.state.currentFrame, 0);
  app.playLoop(1100); assert.equal(app.state.currentFrame, 4);
  app.playLoop(1200); assert.equal(app.state.currentFrame, 6);
  app.playLoop(1300); assert.equal(app.state.currentFrame, 0);
  assert.deepEqual(app.rendered, [0, 4, 6, 0]);
});

test('catch-up ticks consume playable intervals and non-looping playback stops without trailing skipped time', () => {
  const loop = editor([1, 2, 3, 5]); loop.play(); loop.playLoop(1000); loop.playLoop(1300);
  assert.equal(loop.state.currentFrame, 0); assert.equal(loop.state.lastTick, 1300);
  const once = editor([1, 2, 3, 5, 6], { loopPlayback: false }); once.play(); once.playLoop(1000);
  once.playLoop(1100); assert.equal(once.state.currentFrame, 4); assert.equal(once.state.playing, true);
  once.playLoop(1200); assert.equal(once.state.playing, false);
});

test('normal playback retains the configured FPS when nothing is skipped', () => {
  const app = editor([], { fps: 20 });
  assert.equal(next(app).frame, 1); assert.equal(next(app).frame, 2);
  app.play(); app.playLoop(1000); app.playLoop(1050); assert.equal(app.state.currentFrame, 3);
});
