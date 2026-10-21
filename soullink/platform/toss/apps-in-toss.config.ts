import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: 'soullink',
  brand: { primaryColor: '#dec695' },
  navigationBar: { withBackButton: true, withHomeButton: true, withTitle: false, transparentBackground: true, theme: 'dark' },
  webView: {
    allowsInlineMediaPlayback: true,
    bounces: false,
    pullToRefreshEnabled: false,
    overScrollMode: 'never',
    allowsBackForwardNavigationGestures: false,
    mediaPlaybackRequiresUserAction: false,
  },
  permissions: [],
  webBundleDir: 'dist',
});
