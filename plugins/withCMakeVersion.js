const { withProjectBuildGradle } = require("@expo/config-plugins");

// AGP defaults native modules to CMake 3.22.1, whose ninja 1.10 can't create
// directories past Windows' 248-character limit, which SDK 58's codegen object
// paths pass. Set unconditionally: the React Native plugin adds the app's CMake
// path after finalizeDsl runs.
const CMAKE_VERSION = "3.31.6";

const CMAKE_BLOCK = `
subprojects { sub ->
    ["com.android.application", "com.android.library"].each { id ->
        sub.plugins.withId(id) {
            sub.extensions.getByName("androidComponents").finalizeDsl { android ->
                android.externalNativeBuild.cmake.version = "${CMAKE_VERSION}"
            }
        }
    }
}
`;

const withCMakeVersion = (config) => {
  return withProjectBuildGradle(config, (config) => {
    const { contents } = config.modResults;
    if (!contents.includes("externalNativeBuild.cmake.version")) {
      // Before expo-root-project, which evaluates the subprojects and closes their DSL.
      config.modResults.contents = contents.replace(
        /^apply plugin: "expo-root-project"/m,
        `${CMAKE_BLOCK}\n$&`,
      );
    }
    return config;
  });
};

module.exports = withCMakeVersion;
