const { getSentryExpoConfig } = require("@sentry/react-native/metro");

// Sentry's wrapper stamps Debug IDs into the bundle and source maps. Without them
// GlitchTip can't map release crashes back to source.
const config = getSentryExpoConfig(__dirname);

// CHANGELOG.md is imported as a string so Settings can show it. The transformer
// wraps .md files before handing them to Expo's own babel transformer.
config.resolver.sourceExts.push("md");
config.transformer.babelTransformerPath = require.resolve("./metro.transformer.js");

module.exports = config;
