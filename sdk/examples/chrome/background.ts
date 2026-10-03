import { initChrome } from '../../dist/index.js';

// A service worker wakes up for many reasons — don't count that as a user opening the extension.
const analytics = initChrome({
  key: 'mk_PASTE_YOUR_KEY',
  endpoint: 'https://crm.example.com/api/ingest',
  autoOpen: false,
});

chrome.runtime.onInstalled.addListener(() => analytics.track('installed'));
