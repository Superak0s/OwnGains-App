const { withAppBuildGradle } = require("@expo/config-plugins");

// Bundles native symbol tables into the AAB so Play Console symbolicates native
// crashes and ANRs in Android vitals instead of warning about missing symbols.
const withNativeDebugSymbols = (config) => {
  return withAppBuildGradle(config, (config) => {
    const { contents } = config.modResults;
    if (!contents.includes("debugSymbolLevel")) {
      config.modResults.contents = contents.replace(
        /(buildTypes\s*\{[\s\S]*?\brelease\s*\{)/,
        `$1\n            ndk { debugSymbolLevel 'SYMBOL_TABLE' }`,
      );
    }
    return config;
  });
};

module.exports = withNativeDebugSymbols;
