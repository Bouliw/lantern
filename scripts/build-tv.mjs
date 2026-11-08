#!/usr/bin/env node
// Builds the webOS package and installs it on a TV in developer mode (needs the webOS CLI, "ares").
//
//   npm run tv -- --server http://192.168.1.10:8096 [--device tv] [--no-install]
//   npm run tv -- --release   generic package (the server is chosen on the TV) and its
//                             Homebrew Channel manifest, nothing installed
//
// --server and --device can also live in lantern.config.json (git-ignored):
//   { "server": "http://192.168.1.10:8096", "device": "tv" }
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const REPO = 'https://github.com/Bouliw/lantern';
const release = flag('release');
const local = existsSync(join(root, 'lantern.config.json')) ? JSON.parse(readFileSync(join(root, 'lantern.config.json'), 'utf8')) : {};
const server = opt('server') ?? process.env.LANTERN_SERVER ?? local.server;
const device = opt('device') ?? process.env.LANTERN_TV ?? local.device ?? 'tv';
if (!server && !release) {
  console.error('Missing --server (the address of your Jellyfin server as seen from the TV).');
  process.exit(1);
}
// Where the Lantern web server runs (for extras such as translated summaries); defaults to the
// Jellyfin host on port 8097.
const web = release ? undefined : opt('web') ?? local.web ?? (() => {
  const u = new URL(server);
  return `${u.protocol}//${u.hostname}:8097`;
})();

const run = (cmd, argv) => execFileSync(cmd, argv, { cwd: root, stdio: 'inherit' });

run('npx', ['vite', 'build', '--mode', 'tv']);
const out = join(root, 'dist-tv');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const appinfo = JSON.parse(readFileSync(join(root, 'webos/appinfo.json'), 'utf8'));
appinfo.version = pkg.version;
writeFileSync(join(out, 'appinfo.json'), JSON.stringify(appinfo, null, 2));
for (const f of ['icon.png', 'largeIcon.png']) copyFileSync(join(root, 'webos', f), join(out, f));

// The packaged app has no host to guess the server from, so it is written in at build time.
// A release package has none: Lantern asks for the server on first launch.
if (!release) {
  const indexPath = join(out, 'index.html');
  const html = readFileSync(indexPath, 'utf8').replace(
    '<head>',
    `<head>\n    <script>window.LANTERN_CONFIG = ${JSON.stringify({ server, web })};</script>`,
  );
  writeFileSync(indexPath, html);
}

const ipkDir = join(root, 'out');
mkdirSync(ipkDir, { recursive: true });
for (const f of readdirSync(ipkDir)) if (f.startsWith(appinfo.id)) rmSync(join(ipkDir, f));
run('ares-package', [out, '-o', ipkDir, '--no-minify']);
const ipk = readdirSync(ipkDir)
  .filter((f) => f.startsWith(appinfo.id) && f.endsWith('.ipk'))
  .map((f) => join(ipkDir, f))
  .pop();
console.log(`Package: ${ipk}`);

if (release) {
  const manifest = {
    id: appinfo.id,
    version: appinfo.version,
    type: 'web',
    title: appinfo.title,
    appDescription: pkg.description,
    iconUri: `${REPO.replace('github.com', 'raw.githubusercontent.com')}/main/webos/largeIcon.png`,
    sourceUrl: REPO,
    rootRequired: false,
    ipkUrl: basename(ipk),
    ipkHash: { sha256: createHash('sha256').update(readFileSync(ipk)).digest('hex') },
  };
  const path = join(ipkDir, `${appinfo.id}.manifest.json`);
  writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Manifest: ${path}`);
}

if (!flag('no-install') && !release) {
  run('ares-install', ['-d', device, ipk]);
  run('ares-launch', ['-d', device, appinfo.id]);
}
