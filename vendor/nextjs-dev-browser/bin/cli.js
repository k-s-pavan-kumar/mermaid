#!/usr/bin/env node
// bin/cli.js
//
// Entrypoint for the `dev-browser` command, installed into
// node_modules/.bin by npm when this package is a dependency.
//
// Usage:
//   dev-browser dev      # start `next dev` + auto-open the browser
//   dev-browser open     # reopen the browser without restarting next dev
//   dev-browser init     # one-time: add scripts to package.json

const path = require('path');

const [, , subcommand, ...rest] = process.argv;

const commands = {
  dev: 'dev-with-browser.js',
  open: 'open-browser.js',
  init: 'init.js',
};

function printUsage() {
  console.log(`Usage: dev-browser <command> [args]

Commands:
  dev     Start "next dev" and auto-open an ephemeral localhost browser
  open    Reopen the browser without restarting the dev server
  init    Add the required scripts to this project's package.json

Examples:
  dev-browser dev
  dev-browser open 5173
  npx dev-browser init
`);
}

if (!subcommand || !commands[subcommand]) {
  printUsage();
  process.exit(subcommand ? 1 : 0);
}

// Forward remaining argv so the target script's own process.argv parsing
// (e.g. a port number) keeps working unchanged.
process.argv = [process.argv[0], process.argv[1], ...rest];
require(path.join(__dirname, '..', 'lib', commands[subcommand]));
