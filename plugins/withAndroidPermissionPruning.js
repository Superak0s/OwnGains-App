const { withAndroidManifest } = require("@expo/config-plugins");

// Permissions this app never exercises, declared either by the bare template or
// by a dependency's own manifest with no option to opt out. Deleting the entry
// is not enough (the manifest merger pulls the library declarations back in at
// build time), so each is marked tools:node="remove" instead.
//
// SYSTEM_ALERT_WINDOW: template boilerplate, nothing draws over other apps.
// RECORD_AUDIO: expo-camera/expo-image-picker, capture is images-only.
// READ/WRITE_CONTACTS: nothing in the app reads the address book.
// WRITE_EXTERNAL_STORAGE: expo-file-system/expo-image-picker. Every write goes
// to the app-private document directory.
//
// READ_EXTERNAL_STORAGE is deliberately kept: it is capped at maxSdkVersion 32
// and still backs gallery imports on Android 12 and lower.
//
// ACCESS_*_LOCATION are listed even though no dependency requests them today:
// reminders are time-based only, and a location permission reintroduced by a
// transitive manifest would silently put the listing back into Play's
// background-location review.
const REMOVED_PERMISSIONS = [
  "android.permission.SYSTEM_ALERT_WINDOW",
  "android.permission.RECORD_AUDIO",
  "android.permission.READ_CONTACTS",
  "android.permission.WRITE_CONTACTS",
  "android.permission.WRITE_EXTERNAL_STORAGE",
  "android.permission.ACCESS_COARSE_LOCATION",
  "android.permission.ACCESS_FINE_LOCATION",
  "android.permission.ACCESS_BACKGROUND_LOCATION",
];

const withAndroidPermissionPruning = (config) =>
  withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    manifest.$ = { ...manifest.$, "xmlns:tools": "http://schemas.android.com/tools" };

    const kept = (manifest["uses-permission"] ?? []).filter(
      (entry) => !REMOVED_PERMISSIONS.includes(entry.$?.["android:name"]),
    );

    manifest["uses-permission"] = [
      ...kept,
      ...REMOVED_PERMISSIONS.map((name) => ({
        $: { "android:name": name, "tools:node": "remove" },
      })),
    ];

    return config;
  });

module.exports = withAndroidPermissionPruning;
