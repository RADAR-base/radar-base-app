module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // babel-preset-expo automatically adds `react-native-reanimated/plugin`
    // when react-native-reanimated is installed (used by @shopify/react-native-skia's
    // useClock), so it does not need to be listed here manually.
  };
};
