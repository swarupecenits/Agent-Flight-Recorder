import {copyFile, mkdir, readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const project = fileURLToPath(new URL('../../../', import.meta.url));
const output = join(project, 'artifacts', 'hackathon-video-remotion');
const publicDir = join(root, 'public');
await mkdir(join(publicDir, 'fonts'), {recursive: true});
await mkdir(join(publicDir, 'screenshots'), {recursive: true});
await mkdir(join(output, 'assets', 'screenshots'), {recursive: true});
const {screenshots} = JSON.parse(await readFile(join(root, 'story.json'), 'utf8'));
await Promise.all(Object.entries(screenshots).flatMap(([id, name]) => {
  const source = join(project, 'artifacts', 'hackathon-video', 'assets', 'screenshots', name);
  return [
    copyFile(source, join(publicDir, 'screenshots', `${id}.png`)),
    copyFile(source, join(output, 'assets', 'screenshots', name)),
  ];
}));
await Promise.all(['segoeui.ttf', 'seguisb.ttf', 'segoeuib.ttf', 'consola.ttf', 'georgiai.ttf'].map(name =>
  copyFile(join(process.env.WINDIR ?? 'C:\\Windows', 'Fonts', name), join(publicDir, 'fonts', name))));
await copyFile(join(output, 'audio', 'master.wav'), join(publicDir, 'master.wav'));
const cues = JSON.parse(await readFile(join(output, 'captions.json'), 'utf8'));
await writeFile(join(root, 'src', 'captions.generated.json'), JSON.stringify(cues.map(cue => ({
  text: cue.text, startMs: Math.round(cue.start * 1000), endMs: Math.round(cue.end * 1000),
  timestampMs: null, confidence: null, pageBreakAfter: true,
})), null, 2));
console.log('Prepared local screenshots, fonts, audio and typed caption data. No uploads.');
