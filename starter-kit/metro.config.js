const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Allow Firebase + other libraries that ship `.mjs` / `.cjs` to resolve under Metro.
// `svg` is added (and removed from `assetExts` below) per react-native-svg-transformer's
// setup so `import Icon from './icon.svg'` yields a component, not an asset URI —
// required for @radarbase/app-kit's header icons.
config.transformer.babelTransformerPath = require.resolve('react-native-svg-transformer');
config.resolver.assetExts = config.resolver.assetExts.filter((ext) => ext !== 'svg');
config.resolver.sourceExts = ['js', 'json', 'ts', 'tsx', 'jsx', 'mjs', 'cjs', 'svg'];

// Prefer the `react-native` package export, then `browser`, then `main`.
// Required by some Firebase ESM bundles.
config.resolver.resolverMainFields = ['react-native', 'browser', 'main'];

// Force the @react-native-firebase packages to resolve to their canonical entry
// points rather than the ESM build, which Metro's default resolver struggles
// with. Safe to keep even if you don't use Firebase.
config.resolver.alias = {
  ...config.resolver.alias,
  '@react-native-firebase/app': '@react-native-firebase/app/lib/index.js',
  '@react-native-firebase/analytics': '@react-native-firebase/analytics/lib/index.js',
  '@react-native-firebase/messaging': '@react-native-firebase/messaging/lib/index.js',
  '@react-native-firebase/remote-config': '@react-native-firebase/remote-config/lib/index.js',
};

// Resolve Firebase "common" directory imports (e.g. `@react-native-firebase/app/lib/common`)
// to their explicit index file, which Metro otherwise fails to find.
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@react-native-firebase/app/lib/common') {
    return {
      filePath: require.resolve('@react-native-firebase/app/lib/common/index.js'),
      type: 'sourceFile',
    };
  }
  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

// ---------------------------------------------------------------------------
// Local library development (only needed while consuming @radarbase/app-kit
// via `file:../` or `npm link` from this monorepo).
//
// If you switch the dependency in package.json to `file:../`, uncomment the
// block below so Metro:
//   1) watches the workspace root for changes to the library source,
//   2) pins React / React Native / react-dom / react-native-web to this app's
//      own node_modules, which avoids the "two copies of React" error you get
//      when both the app and the linked library resolve their own copies.
//
// After this kit is extracted into its own repo and consumes the published
// @radarbase/app-kit from npm, you can delete this block entirely.
// ---------------------------------------------------------------------------
const path = require('path');
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = true;
config.resolver.extraNodeModules = {
  react: path.resolve(projectRoot, 'node_modules/react'),
  'react-dom': path.resolve(projectRoot, 'node_modules/react-dom'),
  'react-native': path.resolve(projectRoot, 'node_modules/react-native'),
  'react-native-web': path.resolve(projectRoot, 'node_modules/react-native-web'),
};

module.exports = config;
