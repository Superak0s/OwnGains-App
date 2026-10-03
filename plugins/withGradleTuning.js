const os = require("os");
const { withGradleProperties } = require("@expo/config-plugins");

// Sized to the machine running prebuild (a WSL VM reports its own limit, not the
// host's). Gradle + Kotlin daemon together must stay well under total RAM or R8
// dies with ENOMEM, so the heaps take about half of it.
const totalGb = Math.floor(os.totalmem() / 1024 ** 3);
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const gradleHeapGb = clamp(Math.round(totalGb * 0.35), 4, 12);
const kotlinHeapGb = clamp(Math.round(totalGb * 0.12), 1, 4);
const cpuCount = os.availableParallelism?.() ?? os.cpus().length;

// Properties to force to a specific value (overwrites whatever prebuild wrote)
const FORCED_PROPERTIES = {
  "org.gradle.jvmargs": `-Xmx${gradleHeapGb}g -XX:MaxMetaspaceSize=1g -XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200`,
  "org.gradle.workers.max": String(cpuCount),
  "org.gradle.parallel": "true",
  "org.gradle.caching": "true",
  "org.gradle.configureondemand": "true",
  "kotlin.daemon.jvm.options": `-Xmx${kotlinHeapGb}g`,
  "android.enableR8.fullMode": "true",
  // x86_64 is emulator-only weight. Dropping armeabi-v7a excludes every 32-bit
  // device, so only release.sh narrows it: arm64-v8a for the APKs unless
  // `--32bit` is passed, and never for the AAB.
  reactNativeArchitectures: "armeabi-v7a,arm64-v8a",
};

function setProperty(modResults, key, value) {
  const existing = modResults.find(
    (item) => item.type === "property" && item.key === key,
  );
  if (existing) {
    existing.value = value;
  } else {
    modResults.push({ type: "property", key, value });
  }
  return modResults;
}

const withGradleTuning = (config) => {
  return withGradleProperties(config, (config) => {
    let results = config.modResults;

    for (const [key, value] of Object.entries(FORCED_PROPERTIES)) {
      results = setProperty(results, key, value);
    }

    config.modResults = results;
    return config;
  });
};

module.exports = withGradleTuning;
