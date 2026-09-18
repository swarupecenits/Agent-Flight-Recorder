import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';
import { hash } from './schema.ts';
import type { CaptureGap, Scope } from './types.ts';

const exec = promisify(execFile);
const credentialPath = /(^|\/)(\.env($|\.)|[^/]*(secret|credential)[^/]*|[^/]+\.(pem|pfx|p12|key))$/i;
function localGitEnvironment() {
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_OPTIONAL_LOCKS: '0' };
  for (const key of Object.keys(env)) {
    if (/^GIT_(CONFIG_(COUNT|KEY_\d+|VALUE_\d+)|DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|COMMON_DIR)$/i.test(key)) delete env[key];
  }
  return env;
}
export interface WorkspaceSnapshot {
  scope: Scope;
  head: string | null;
  fileCount: number;
  gaps: CaptureGap[];
  instructionVersions: { path: string; version: string }[];
}
export async function snapshotWorkspace(directory: string, unsavedDocuments: string[] = []): Promise<WorkspaceSnapshot> {
  const root = await realpath(directory);
  const result: WorkspaceSnapshot = {
    scope: { repositoryId: `workspace:${hash(process.platform === 'win32' ? root.toLowerCase() : root)}` },
    head: null, fileCount: 0, instructionVersions: [],
    gaps: [{ code: 'BOUNDED_FILE_SET', detail: 'Fingerprint covers Git-visible tracked and untracked files. Ignored files, credentials, external dependencies, and runtime resources are outside this version boundary. Source contents are not stored.' }],
  };
  let names: string[];
  const env = localGitEnvironment();
  try {
    const gitRoot = await exec('git', ['-C', root, 'rev-parse', '--show-toplevel'], { timeout: 10000, windowsHide: true, env });
    const actual = await realpath(gitRoot.stdout.trim());
    if (relative(root, actual)) {
      result.gaps.push({ code: 'WORKSPACE_NOT_REPOSITORY_ROOT', detail: 'Choose the repository root as your workspace folder for a complete declared file-set fingerprint.' });
      return result;
    }
    const files = await exec('git', ['-C', root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
      timeout: 15000, windowsHide: true, maxBuffer: 4 * 1024 * 1024, env,
    });
    names = [...new Set(files.stdout.split('\0').filter(Boolean))].sort();
  } catch {
    result.gaps.push({ code: 'GIT_INVENTORY_UNAVAILABLE', detail: 'A bounded Git file inventory could not be read. A code version is unavailable; task exit alone cannot establish a version-bound claim.' });
    return result;
  }
  try { result.head = (await exec('git', ['-C', root, 'rev-parse', '--verify', 'HEAD'], { timeout: 10000, windowsHide: true, env })).stdout.trim(); }
  catch { result.gaps.push({ code: 'COMMIT_UNAVAILABLE', detail: 'No readable commit is available. The captured working-file-set hash is used independently of commit history.' }); }
  if (names.length > 4000) {
    result.gaps.push({ code: 'FILE_SET_LIMIT', detail: 'More than 4,000 Git-visible files were found. No partial subset is presented as a complete code version.' });
    return result;
  }
  let bytes = 0;
  let complete = true;
  const fingerprints: [string, string][] = [];
  for (const name of names) {
    if (credentialPath.test(name)) continue;
    const path = join(root, ...name.split('/'));
    const within = relative(root, path);
    if (isAbsolute(within) || within === '..' || within.startsWith(`..${sep}`)) throw new Error('Git returned a path outside the chosen workspace.');
    try {
      let ancestor = root;
      for (const part of within.split(sep)) {
        ancestor = join(ancestor, part);
        if ((await lstat(ancestor)).isSymbolicLink()) throw new Error('SYMLINK_OUTSIDE_CAPTURE');
      }
      const before = await lstat(path);
      if (!before.isFile() || before.size > 2 * 1024 * 1024 || bytes + before.size > 32 * 1024 * 1024) {
        complete = false; continue;
      }
      const content = await readFile(path);
      const after = await lstat(path);
      if (before.mtimeMs !== after.mtimeMs || before.size !== after.size) complete = false;
      bytes += content.byteLength;
      const digest = hash(content.toString('base64'));
      fingerprints.push([name, digest]);
      if (/^(AGENTS\.md|\.github\/copilot-instructions\.md|\.github\/instructions\/[^/]+\.instructions\.md)$/.test(name)) result.instructionVersions.push({ path: name, version: digest });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') fingerprints.push([name, 'deleted']);
      else complete = false;
    }
  }
  result.fileCount = fingerprints.length;
  if (!complete) result.gaps.push({ code: 'INCOMPLETE_FINGERPRINT', detail: 'A file was oversized, unreadable, linked, changing while read, or exceeded the total size bound. No complete code version is claimed.' });
  if (unsavedDocuments.length) {
    complete = false;
    result.gaps.push({ code: 'UNSAVED_BUFFERS', detail: `${unsavedDocuments.length} unsaved editor buffers differ from disk. Save them and rerun validation before claiming support.` });
  }
  if (complete) result.scope.codeVersion = `tree-sha256:${hash(fingerprints)}`;
  return result;
}
