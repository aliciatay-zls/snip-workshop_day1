#!/usr/bin/env node
'use strict';

const { spawn } = require('node:child_process');

const USAGE = `Usage:
  snip add <url>    Create a short link
  snip ls           List all links
  snip open <code>  Open a short link in your browser
  snip help         Show this help

Set SNIP_API to change the API base URL (default: http://localhost:3000).`;

function fail(message) {
  console.error(`Error: ${message}`);
  process.exitCode = 1;
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function apiBaseUrl() {
  const value = (process.env.SNIP_API || 'http://localhost:3000').replace(/\/+$/, '');
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('SNIP_API must be a valid HTTP(S) URL.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('SNIP_API must use HTTP or HTTPS.');
  }
  return value;
}

async function request(path, options = {}) {
  const url = `${apiBaseUrl()}${path}`;
  let response;
  try {
    response = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(10000),
    });
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      throw new Error(`Request timed out: ${url}`);
    }
    throw new Error(`Could not reach the Snip API at ${url}.`);
  }

  if (response.status >= 300 && response.status < 400 && options.redirect === 'manual') {
    return response;
  }

  let body;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = body && typeof body.error === 'string' ? body.error : `HTTP ${response.status}`;
    throw new Error(detail);
  }
  return body;
}

function printLinks(links) {
  if (!Array.isArray(links)) {
    throw new Error('The API returned an invalid links response.');
  }
  if (links.length === 0) {
    console.log('No links yet.');
    return;
  }

  const codeWidth = Math.max(4, ...links.map((link) => String(link.code).length));
  const hitsWidth = Math.max(4, ...links.map((link) => String(link.hits).length));
  const rows = [
    `${'CODE'.padEnd(codeWidth)}  ${'HITS'.padStart(hitsWidth)}  URL`,
    ...links.map((link) => (
      `${String(link.code).padEnd(codeWidth)}  ${String(link.hits).padStart(hitsWidth)}  ${link.url}`
    )),
  ];
  console.log(rows.join('\n'));
}

function openInBrowser(target) {
  const platform = process.platform;
  let command;
  let args;
  if (platform === 'darwin') {
    command = 'open';
    args = [target];
  } else if (platform === 'win32') {
    command = 'cmd.exe';
    args = ['/d', '/s', '/c', `start "" "${target}"`];
  } else {
    command = 'xdg-open';
    args = [target];
  }

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
    child.once('error', () => reject(new Error(`Could not launch the system browser (${command}).`)));
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

async function run(args) {
  const [command, ...rest] = args;
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    if (rest.length) {
      fail(USAGE);
      return;
    }
    console.log(USAGE);
    return;
  }

  if (command === 'add') {
    if (rest.length !== 1 || !isHttpUrl(rest[0])) {
      fail('Provide one valid HTTP(S) URL.\n\n' + USAGE);
      return;
    }
    const link = await request('/api/links', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: rest[0] }),
    });
    if (!link || typeof link.shortUrl !== 'string') {
      throw new Error('The API returned an invalid link response.');
    }
    console.log(link.shortUrl);
    return;
  }

  if (command === 'ls') {
    if (rest.length) {
      fail(USAGE);
      return;
    }
    printLinks(await request('/api/links'));
    return;
  }

  if (command === 'open') {
    if (rest.length !== 1 || !/^[A-Za-z0-9]{6}$/.test(rest[0])) {
      fail('Provide one valid six-character short code.\n\n' + USAGE);
      return;
    }
    const response = await request(`/${encodeURIComponent(rest[0])}`, { redirect: 'manual' });
    if (![301, 302, 303, 307, 308].includes(response.status)) {
      throw new Error(`Expected a redirect, received HTTP ${response.status}.`);
    }
    const location = response.headers.get('location');
    if (!location) {
      throw new Error('The API redirect did not include a destination.');
    }
    const target = new URL(location, `${apiBaseUrl()}/`);
    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
      throw new Error('The API returned an invalid browser destination.');
    }
    await openInBrowser(target.href);
    console.log(`Opened ${target.href}`);
    return;
  }

  fail(`Unknown command: ${command}\n\n${USAGE}`);
}

run(process.argv.slice(2)).catch((error) => fail(error.message));
