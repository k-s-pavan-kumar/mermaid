// lib/init.js
//
// Invoked via `npx nextjs-dev-browser init` (works even before the
// package is installed — npx fetches it temporarily to run this file)
// or `dev-browser init` if it's already a devDependency.
//
// Goal: ONE command turns an existing project into a working setup.
// Concretely, this:
//   1. Adds this package to the project's devDependencies (if missing)
//   2. Runs `npm install` so it's actually placed in node_modules —
//      this also fires the package's own postinstall (Chromium download)
//   3. Adds the "dev" / "dev:plain" / "browser" scripts, without ever
//      clobbering a script the user already customized
//   4. Flags (and optionally removes, with --remove-legacy) any leftover
//      hand-copied scripts/*.js files from an earlier manual setup

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const cwd = process.cwd();
const pkgPath = path.join(cwd, 'package.json');
const ownPkg = require('../package.json');

if (!fs.existsSync(pkgPath)) {
  console.error('[dev-browser init] No package.json found in the current directory.');
  console.error('Run this from the root of your Next.js project (e.g. `cd my-app && npx nextjs-dev-browser init`).');
  process.exit(1);
}

function readPkg() {
  try {
    return JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  } catch (err) {
    console.error(`[dev-browser init] Could not parse package.json: ${err.message}`);
    process.exit(1);
  }
}

function writePkg(pkg) {
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
}

// --- Step 1: make sure this package is declared as a devDependency ---

let pkg = readPkg();
const alreadyDeclared =
  (pkg.dependencies && pkg.dependencies[ownPkg.name]) ||
  (pkg.devDependencies && pkg.devDependencies[ownPkg.name]);

let neededInstall = false;

if (!alreadyDeclared) {
  pkg.devDependencies = pkg.devDependencies || {};
  pkg.devDependencies[ownPkg.name] = `^${ownPkg.version}`;
  writePkg(pkg);
  neededInstall = true;
  console.log(`[dev-browser init] Added "${ownPkg.name}": "^${ownPkg.version}" to devDependencies.`);
}

// --- Step 2: actually install it (and anything else missing) ---
// Skip if it's already in node_modules with a resolvable bin — avoids a
// redundant `npm install` on repeated `dev-browser init` runs.

const binMarker = path.join(cwd, 'node_modules', '.bin', 'dev-browser');
if (neededInstall || !fs.existsSync(binMarker)) {
  console.log('[dev-browser init] Running npm install...');
  const result = spawnSync('npm', ['install'], { cwd, stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    console.error('[dev-browser init] npm install failed. Fix the error above and re-run `npx nextjs-dev-browser init`.');
    process.exit(result.status || 1);
  }
}

// Re-read in case npm install touched package.json (e.g. normalized ranges).
pkg = readPkg();

// --- Step 3: wire up scripts, without clobbering customizations ---

pkg.scripts = pkg.scripts || {};

const desiredScripts = {
  dev: 'dev-browser dev',
  'dev:plain': pkg.scripts.dev && pkg.scripts.dev !== 'dev-browser dev' ? pkg.scripts.dev : 'next dev',
  browser: 'dev-browser open',
};

const skipped = [];
let scriptsChanged = false;

for (const [key, value] of Object.entries(desiredScripts)) {
  const existing = pkg.scripts[key];
  if (existing === value) continue;
  if (existing && existing !== value) {
    skipped.push({ key, existing, suggested: value });
    continue;
  }
  pkg.scripts[key] = value;
  scriptsChanged = true;
}

if (scriptsChanged) {
  writePkg(pkg);
  console.log('[dev-browser init] Updated package.json scripts:');
  for (const key of Object.keys(desiredScripts)) {
    if (pkg.scripts[key] === desiredScripts[key]) {
      console.log(`  "${key}": "${pkg.scripts[key]}"`);
    }
  }
}

if (skipped.length) {
  console.log('\n[dev-browser init] Left these untouched (already customized) — update manually if you want the dev browser:');
  for (const { key, existing, suggested } of skipped) {
    console.log(`  "${key}" is "${existing}" — consider "${suggested}"`);
  }
}

if (!scriptsChanged && !skipped.length) {
  console.log('[dev-browser init] package.json scripts already set up.');
}

// --- Step 4: flag (and optionally remove) leftover files from an earlier
// manual (pre-package) setup — the package now supplies this logic from
// node_modules instead, so these are dead weight if still present.

const legacyFiles = [
  'scripts/localhost-browser.js',
  'scripts/dev-with-browser.js',
  'scripts/open-browser.js',
  'scripts/notify.js',
  'scripts/postinstall.js',
];
const foundLegacy = legacyFiles.filter((f) => fs.existsSync(path.join(cwd, f)));

if (foundLegacy.length) {
  console.log('\n[dev-browser init] Found leftover files from an earlier manual setup:');
  for (const f of foundLegacy) console.log(`  ${f}`);
  console.log(
    'These are now superseded by the installed package and can be deleted.\n' +
      'Re-run with --remove-legacy to delete them automatically, e.g.:\n' +
      '  npx nextjs-dev-browser init --remove-legacy'
  );

  if (process.argv.includes('--remove-legacy')) {
    for (const f of foundLegacy) {
      fs.unlinkSync(path.join(cwd, f));
      console.log(`  Deleted ${f}`);
    }
  }
}

console.log('\n[dev-browser init] Done. Run `npm run dev` to try it.');
