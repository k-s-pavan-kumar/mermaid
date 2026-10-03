import { initChrome } from '../../dist/index.js'; // bundle it into your extension — MV3 forbids remotely-hosted code

const analytics = initChrome({
  key: 'mk_PASTE_YOUR_KEY',
  endpoint: 'https://crm.example.com/api/ingest',
}); // the popup opening = one "open"

document.getElementById('save')?.addEventListener('click', () => analytics.track('save_clicked'));
