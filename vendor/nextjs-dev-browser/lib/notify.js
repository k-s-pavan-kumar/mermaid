// scripts/notify.js
//
// Best-effort helper to make "the browser closed, here's how to reopen it"
// impossible to miss — a boxed terminal banner plus a native OS desktop
// notification where available. Never throws: notification failures must
// never affect the dev workflow.

const { spawn } = require('child_process');

function notify(title, message) {
  try {
    if (process.platform === 'darwin') {
      // macOS: built-in, no extra install needed.
      spawn(
        'osascript',
        ['-e', `display notification ${JSON.stringify(message)} with title ${JSON.stringify(title)}`],
        { stdio: 'ignore' }
      ).unref();
    } else if (process.platform === 'linux') {
      // Most desktop Linux distros ship notify-send. Silently no-ops if missing.
      spawn('notify-send', [title, message], { stdio: 'ignore' }).unref();
    }
    // Windows: skipped intentionally. A dependency-free, non-blocking toast
    // API isn't available out of the box; the terminal banner below is the
    // source of truth there. (Can add `node-notifier` later if wanted.)
  } catch {
    // Best-effort only.
  }
}

function printBrowserClosedBanner(port) {
  const cmd = `npm run browser${port && String(port) !== '3000' ? ` -- ${port}` : ''}`;
  const width = Math.max(cmd.length + 8, 46);
  const line = '─'.repeat(width);

  console.log(`\n┌${line}┐`);
  console.log('│  🔒 Dev browser window closed');
  console.log(`│  Dev server is still running on port ${port} (Ctrl+C to stop it)`);
  console.log('│');
  console.log('│  To reopen the browser, run:');
  console.log(`│    ${cmd}`);
  console.log(`└${line}┘\n`);

  notify('Dev browser closed', `Run "${cmd}" to reopen it.`);
}

module.exports = { notify, printBrowserClosedBanner };
