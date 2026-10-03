module.exports = function (api) {
  // Keyed on NODE_ENV, not cached outright: a plain api.cache(true) lets a
  // config computed during a dev run be reused for the release bundle, which
  // would include the console calls the plugin below is here to strip.
  api.cache.using(() => process.env.NODE_ENV);
  const isProduction = process.env.NODE_ENV === "production";
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      [
        "module-resolver",
        {
          root: ["./src"],
          alias: {
            "@features": "./src/features",
            "@shared": "./src/shared",
            "@utils": "./src/utils",
          },
        },
      ],
      // Strips debug/info/log from release builds. Error/warn stay so crash
      // triage still works.
      isProduction && [
        "transform-remove-console",
        { exclude: ["error", "warn"] },
      ],
    ].filter(Boolean),
  };
};
