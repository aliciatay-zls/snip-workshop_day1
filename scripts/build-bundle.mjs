import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bundle = join(root, 'bundle');
const frontend = join(root, 'frontend');
const frontendOutput = join(frontend, 'dist', 'snip-frontend', 'browser');
const push = process.argv.includes('--push');
const unknownArgs = process.argv.slice(2).filter((arg) => arg !== '--push');

if (unknownArgs.length > 0) {
  throw new Error(`Unknown argument(s): ${unknownArgs.join(', ')}`);
}

if (execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).trim() !== 'main') {
  throw new Error('Run this script from a main checkout.');
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`);
  }
}

function git(args, cwd = root) {
  execFileSync('git', args, { cwd, stdio: 'inherit' });
}

function commitStaged(cwd, message) {
  const result = spawnSync('git', ['diff', '--cached', '--quiet'], { cwd, stdio: 'ignore' });
  if (result.error) {
    throw result.error;
  }
  if (result.status === 0) {
    return false;
  }
  if (result.status !== 1) {
    throw new Error(`Could not check staged changes in ${cwd}.`);
  }

  git([
    'commit',
    '-m',
    message,
    '-m',
    'Co-authored-by: OpenBot <335604065+openbotgit[bot]@users.noreply.github.com>',
    '-m',
    'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>',
  ], cwd);
  return true;
}

git(['submodule', 'update', '--init', '--remote', 'backend', 'frontend', 'cli']);
run('npm', ['install'], frontend);
run('npx', ['ng', 'build'], frontend);

if (!existsSync(join(frontendOutput, 'index.html'))) {
  throw new Error(`Angular build output is missing: ${join(frontendOutput, 'index.html')}`);
}

const generatedFiles = [
  'public',
  'server.js',
  'cli.js',
  '.env',
  'package.json',
  'Dockerfile',
  '.dockerignore',
  'railway.json',
];
for (const file of generatedFiles) {
  rmSync(join(bundle, file), { recursive: true, force: true });
}

mkdirSync(join(bundle, 'public'), { recursive: true });
cpSync(join(root, 'backend', 'server.js'), join(bundle, 'server.js'));
cpSync(join(root, 'cli', 'cli.js'), join(bundle, 'cli.js'));
cpSync(frontendOutput, join(bundle, 'public'), { recursive: true });
writeFileSync(join(bundle, '.env'), 'PUBLIC_DIR=./public\n');
writeFileSync(join(bundle, 'package.json'), `${JSON.stringify({
  name: 'snip-bundle',
  private: true,
  scripts: { start: 'bun server.js' },
}, null, 2)}\n`);
writeFileSync(
  join(bundle, 'Dockerfile'),
  [
    'FROM oven/bun:1-alpine',
    'COPY . .',
    'ENV PORT=3000',
    'EXPOSE 3000',
    'CMD ["bun", "server.js"]',
    '',
  ].join('\n'),
);
writeFileSync(
  join(bundle, '.dockerignore'),
  ['.git', 'node_modules', '*.log', '.DS_Store', ''].join('\n'),
);
writeFileSync(
  join(bundle, 'railway.json'),
  `${JSON.stringify({
    $schema: 'https://railway.com/railway.schema.json',
    build: { builder: 'DOCKERFILE', dockerfilePath: 'Dockerfile' },
  }, null, 2)}\n`,
);

git(['add', '--all'], bundle);
const bundleChanged = commitStaged(bundle, 'Generate Snip release bundle');

git(['add', 'backend', 'frontend', 'cli', 'bundle']);
const pointersChanged = commitStaged(root, 'Update source and bundle submodule pointers');

if (!bundleChanged && !pointersChanged) {
  console.log('unchanged');
}

if (push) {
  git(['push', 'origin', 'HEAD:bundle'], bundle);
  git(['push', 'origin', 'main']);
}
