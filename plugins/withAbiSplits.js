const { withAppBuildGradle } = require("@expo/config-plugins");

// Per-ABI release APKs instead of one universal ~71 MB binary. Gradle applies
// splits only when no bundle* task is requested: AGP 9 fails bundleRelease with
// "Multiple shrunk-resources files found" if ABI splits are on. Play splits the AAB anyway.
// The ABI list comes from the reactNativeArchitectures property set in
// plugins/withGradleTuning.js.
const SPLITS_BLOCK = `
    splits {
        abi {
            enable !gradle.startParameter.taskNames.any { it.toLowerCase().contains("bundle") }
            reset()
            include(*(findProperty("reactNativeArchitectures") ?: "armeabi-v7a,arm64-v8a").split(","))
            universalApk false
        }
    }
`;

const withAbiSplits = (config) => {
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.contents.includes("splits {")) {
      return config;
    }
    config.modResults.contents = config.modResults.contents.replace(
      /^android\s*\{/m,
      `android {\n${SPLITS_BLOCK}`,
    );
    return config;
  });
};

module.exports = withAbiSplits;
