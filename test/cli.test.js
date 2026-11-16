'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { after, before, test } = require('node:test');

const cliPath = path.resolve(__dirname, '..', 'cli.js');
let server;
let apiBase;
let tempDir;
let links = [];

function respond(response, status, body, headers = {}) {
  response.writeHead(status, { 'content-type': 'application/json', ...headers });
  response.end(body === null ? '' : JSON.stringify(body));
}

before(async () => {
  server = http.createServer((request, response) => {
    if (request.method === 'POST' && request.url === '/api/links') {
      let raw = '';
      request.setEncoding('utf8');
      request.on('data', (chunk) => { raw += chunk; });
      request.on('end', () => {
        const { url } = JSON.parse(raw);
        const link = { code: 'abc123', url, shortUrl: 'http://localhost:3000/abc123', hits: 0, createdAt: new Date().toISOString() };
        links.push(link);
        respond(response, 201, link);
      });
      return;
    }
    if (request.method === 'GET' && request.url === '/api/links') {
      respond(response, 200, links);
      return;
    }
    if (request.method === 'GET' && request.url === '/abc123') {
      response.writeHead(302, { location: 'https://example.com/path' });
      response.end();
      return;
    }
    if (request.method === 'GET' && request.url === '/bad999') {
      respond(response, 404, { error: 'Link not found' });
      return;
    }
    respond(response, 404, { error: 'Not found' });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  apiBase = `http://127.0.0.1:${server.address().port}`;
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snip-cli-test-'));
  links = [];
});

after(async () => {
  if (server) {
    server.close();
    await once(server, 'close');
  }
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
});

function runCli(args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      env: { ...process.env, SNIP_API: apiBase, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (status, signal) => resolve({ status, signal, stdout, stderr }));
  });
}

async function waitForFile(filePath) {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    try {
      await fs.promises.access(filePath);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw new Error(`Timed out waiting for ${filePath}`);
}

test('help prints usage without an API request', async () => {
  const result = await runCli(['help']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /snip add <url>/);
});

test('invalid add input fails before making an API request', async () => {
  const result = await runCli(['add', 'file:///etc/passwd']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /HTTP\(S\) URL/);
});

test('add posts a URL and prints the returned short link', async () => {
  const result = await runCli(['add', 'https://example.com/page']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), 'http://localhost:3000/abc123');
});

test('ls prints the empty state and aligned link rows', async () => {
  links = [];
  assert.equal((await runCli(['ls'])).stdout.trim(), 'No links yet.');

  links = [
    { code: 'abc123', url: 'https://example.com', hits: 2 },
    { code: 'xy9876', url: 'https://example.org', hits: 12 },
  ];
  const result = await runCli(['ls']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /CODE\s+HITS\s+URL/);
  assert.match(result.stdout, /abc123\s+2\s+https:\/\/example\.com/);
  assert.match(result.stdout, /xy9876\s+12\s+https:\/\/example\.org/);
});

test('API errors are printed to stderr with exit code 1', async () => {
  const result = await runCli(['open', 'bad999']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Link not found/);
});

test('open requests redirects manually and launches the Location URL', { skip: process.platform === 'win32' }, async () => {
  const executable = process.platform === 'darwin' ? 'open' : 'xdg-open';
  const browserPath = path.join(tempDir, executable);
  const destinationPath = path.join(tempDir, 'destination');
  fs.writeFileSync(browserPath, `#!/bin/sh\nprintf '%s' "$1" > "${destinationPath}"\n`);
  fs.chmodSync(browserPath, 0o755);

  const result = await runCli(['open', 'abc123'], {
    PATH: `${tempDir}${path.delimiter}${process.env.PATH || ''}`,
  });
  assert.equal(result.status, 0, result.stderr);
  await waitForFile(destinationPath);
  assert.equal(fs.readFileSync(destinationPath, 'utf8'), 'https://example.com/path');
  assert.match(result.stdout, /Opened https:\/\/example\.com\/path/);
});

test('unreachable backend fails cleanly', async () => {
  const result = await runCli(['ls'], { SNIP_API: 'http://127.0.0.1:1' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Could not reach the Snip API/);
});
