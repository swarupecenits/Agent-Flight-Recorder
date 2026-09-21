import {bundle} from '@remotion/bundler';
import {openBrowser, renderMedia, renderStill, selectComposition} from '@remotion/renderer';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = fileURLToPath(new URL('../../../artifacts/hackathon-video-remotion/', import.meta.url));
const story = JSON.parse(await readFile(join(root, 'story.json'), 'utf8'));
const mode = process.argv[2];
assert.ok(['previews', 'film', 'poster'].includes(mode), 'Choose previews, film or poster.');
assert.equal(story.scenes.reduce((sum, scene) => sum + scene.duration, 0), 120);
await mkdir(join(output, 'previews'), {recursive: true});
const serveUrl = await bundle({entryPoint: join(root, 'src', 'index.ts'), rootDir: root,
  outDir: join(output, 'bundle'), publicDir: join(root, 'public'), enableCaching: true});
console.log('Bundled the editable motion story.');
const configuredBrowser = process.env.AFR_BROWSER;
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const browserExecutable = configuredBrowser ?? (existsSync(edge) ? edge : undefined);
const browser = await openBrowser('chrome', {browserExecutable, logLevel: 'error'});
const errors = [];
const onBrowserLog = log => {
  if (log.type === 'error') {
    errors.push(log.text);
    console.error('Browser:', log.text);
  }
};
try {
  const composition = await selectComposition({serveUrl, id: 'FlightRecorderStory', puppeteerInstance: browser,
    browserExecutable, onBrowserLog});
  assert.equal(composition.durationInFrames, 3600);
  assert.equal(composition.fps, 30);
  assert.equal(composition.width, 1920);
  assert.equal(composition.height, 1080);
  if (mode === 'previews') {
    let start = 0;
    const frames = [];
    for (const [index, scene] of story.scenes.entries()) {
      for (const [phase, offset] of [['early', 2.3], ['late', scene.duration - 1.2]]) {
        frames.push({frame: Math.round((start + offset) * 30),
          name: `${String(index + 1).padStart(2, '0')}-${scene.id}-${phase}.png`, scene: scene.id, second: start + offset});
      }
      start += scene.duration;
    }
    for (let index = 0; index < frames.length; index += 2) {
      await Promise.all(frames.slice(index, index + 2).map(async item => {
        await renderStill({serveUrl, composition, frame: item.frame, imageFormat: 'png',
          output: join(output, 'previews', item.name), puppeteerInstance: browser, browserExecutable, onBrowserLog});
      }));
      console.log(`Scene previews: ${Math.min(index + 2, frames.length)}/${frames.length}`);
    }
    await writeFile(join(output, 'preview-frames.json'), JSON.stringify(frames, null, 2));
  } else if (mode === 'poster') {
    await renderStill({serveUrl, composition, frame: 3530, imageFormat: 'png', output: join(output, 'Remotion-Story-Poster.png'),
      puppeteerInstance: browser, browserExecutable, onBrowserLog});
  } else {
    let last = -1;
    await renderMedia({
      serveUrl, composition, codec: 'h264', outputLocation: join(output, 'Agent-Flight-Recorder-Remotion-Story.mp4'),
      puppeteerInstance: browser, browserExecutable, onBrowserLog, concurrency: 2,
      crf: 17, pixelFormat: 'yuv420p', imageFormat: 'png', colorSpace: 'bt709', audioCodec: 'aac',
      audioBitrate: '192k', x264Preset: 'medium', enforceAudioTrack: true,
      // Bound AAC encoder padding to the same exact duration as the picture.
      ffmpegOverride: ({type, args}) => type === 'stitcher'
        ? [...args.slice(0, -1), '-t', String(composition.durationInFrames / composition.fps), args.at(-1)]
        : args,
      metadata: {title: 'Agent Flight Recorder - The case of the missing proof',
        comment: 'Original Remotion motion graphics. Supplied prototype screenshots. Local synthesized narration. No submission.'},
      onProgress: ({progress, renderedFrames}) => {
        const percent = Math.floor(progress * 100 / 5) * 5;
        if (percent > last) {
          last = percent;
          console.log(`Render ${percent}% | ${renderedFrames}/3600 frames`);
        }
      },
    });
  }
  assert.deepEqual(errors, [], 'The composition logged browser errors.');
} finally {
  await browser.close({silent: true});
}
console.log(`Finished ${mode}; the owned headless browser has been closed.`);
