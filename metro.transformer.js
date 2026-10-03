const upstream = require(
  require.resolve("@expo/metro-config/build/babel-transformer", {
    paths: [require.resolve("expo/package.json")],
  }),
);

module.exports = {
  ...upstream,
  transform(params) {
    if (!params.filename.endsWith(".md")) return upstream.transform(params);
    return upstream.transform({
      ...params,
      src: `module.exports = ${JSON.stringify(params.src)};`,
    });
  },
};
