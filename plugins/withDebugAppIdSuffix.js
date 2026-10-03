const { withAppBuildGradle } = require("@expo/config-plugins");

// Lets the dev debug build install side-by-side with the release app
// (same applicationId otherwise) instead of failing with
// INSTALL_FAILED_UPDATE_INCOMPATIBLE.
const withDebugAppIdSuffix = (config) => {
  return withAppBuildGradle(config, (config) => {
    if (!config.modResults.contents.includes("applicationIdSuffix")) {
      config.modResults.contents = config.modResults.contents.replace(
        /debug\s*\{\s*signingConfig\s*=?\s*signingConfigs\.debug/,
        (match) => `${match}\n            applicationIdSuffix ".debug"`,
      );
    }
    return config;
  });
};

module.exports = withDebugAppIdSuffix;
