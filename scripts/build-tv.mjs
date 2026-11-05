#!/usr/bin/env node
// Builds the webOS package and installs it on a TV in developer mode (needs the webOS CLI, "ares").
//
//   npm run tv -- --server http://192.168.1.10:8096 [--device tv] [--no-install]
//
// --server and --device can also live in lantern.config.json (git-ignored):
//   { "server": "http://192.168.1.10:8096", "device": "tv" }
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const local = existsSync(join(root, 'lantern.config.json')) ? JSON.parse(readFileSync(join(root, 'lantern.config.json'), 'utf8')) : {};
const server = opt('server') ?? process.env.LANTERN_SERVER ?? local.server;
const device = opt('device') ?? process.env.LANTERN_TV ?? local.device ?? 'tv';
if (!server) {
  console.error('Missing --server (the address of your Jellyfin server as seen from the TV).');
  process.exit(1);
}
// Where the Lantern web server runs (for extras such as translated summaries); defaults to the
// Jellyfin host on port 8097.
const web = opt('web') ?? local.web ?? (() => {
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
const indexPath = join(out, 'index.html');
const html = readFileSync(indexPath, 'utf8').replace(
  '<head>',
  `<head>\n    <script>window.LANTERN_CONFIG = ${JSON.stringify({ server, web })};</script>`,
);
writeFileSync(indexPath, html);

const ipkDir = join(root, 'out');
mkdirSync(ipkDir, { recursive: true });
run('ares-package', [out, '-o', ipkDir, '--no-minify']);
const ipk = readdirSync(ipkDir)
  .filter((f) => f.startsWith(appinfo.id) && f.endsWith('.ipk'))
  .map((f) => join(ipkDir, f))
  .pop();
console.log(`Package: ${ipk}`);

if (!flag('no-install')) {
  run('ares-install', ['-d', device, ipk]);
  run('ares-launch', ['-d', device, appinfo.id]);
}
