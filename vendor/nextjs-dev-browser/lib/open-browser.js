// lib/open-browser.js
//
// Reopens the ephemeral localhost browser without restarting `next dev`.
// Invoked via `dev-browser open` (see bin/cli.js). Use this when you
// accidentally closed the browser window but the dev server is still
// running in another terminal.

const { launchLocalhostBrowser } = require('./localhost-browser');
const { printBrowserClosedBanner } = require('./notify');

const portArg = process.argv[2];
const PORT = portArg || process.env.PORT || 3000;
const URL = `http://localhost:${PORT}`;

(async () => {
  try {
    const browserHandle = await launchLocalhostBrowser(URL);
    browserHandle.onClose(() => {
      printBrowserClosedBanner(PORT);
      process.exit(0);
    });
  } catch (err) {
    console.error(`[dev-browser] Could not open browser: ${err.message}`);
    process.exit(1);
  }
})();
