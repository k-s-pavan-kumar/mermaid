import { initFigma } from '../../dist/index.js'; // or: from 'meridian-analytics'

const analytics = initFigma({
  key: 'mk_PASTE_YOUR_KEY',
  endpoint: 'https://crm.example.com/api/ingest',
}); // counts one "open" per launch

figma.showUI(__html__);

figma.ui.onmessage = async (msg: { type: string }) => {
  if (msg.type === 'export') analytics.track('export_clicked');
  if (msg.type === 'close') {
    await analytics.flush();   // make sure the last events leave before the plugin closes
    figma.closePlugin();
  }
};
