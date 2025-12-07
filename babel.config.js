module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Tamagui babel plugin disabled due to ESM/CJS compatibility issues
      // with Node.js 22+. The app works without it, just without build-time
      // style extraction optimization.
      'react-native-reanimated/plugin',
    ],
  };
};
