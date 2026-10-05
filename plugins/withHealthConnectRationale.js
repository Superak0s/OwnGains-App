const fs = require("node:fs");
const path = require("node:path");
const { withAndroidManifest, withDangerousMod } = require("@expo/config-plugins");

// Health Connect opens this activity from its permission screen and Play
// review requires it to show the privacy policy. The library's own plugin
// routes it to MainActivity, which would just launch the app.
const POLICY_URL = "https://owngains.superak0s.com/privacy-policy.html";
const ACTIVITY = "PermissionsRationaleActivity";

const activitySource = (pkg) => `package ${pkg}

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Bundle

class ${ACTIVITY} : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    try {
      startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("${POLICY_URL}")))
    } catch (e: ActivityNotFoundException) {
    }
    finish()
  }
}
`;

const withRationaleSource = (config) =>
  withDangerousMod(config, [
    "android",
    async (config) => {
      const pkg = config.android.package;
      const dir = path.join(
        config.modRequest.platformProjectRoot,
        "app", "src", "main", "java",
        ...pkg.split("."),
      );
      await fs.promises.mkdir(dir, { recursive: true });
      await fs.promises.writeFile(path.join(dir, `${ACTIVITY}.kt`), activitySource(pkg), "utf8");
      return config;
    },
  ]);

const replaceByName = (list, entry) => [
  ...(list ?? []).filter((item) => item.$["android:name"] !== entry.$["android:name"]),
  entry,
];

const withRationaleManifest = (config) =>
  withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application?.[0];
    if (!application) return config;
    const pkg = config.android.package;
    application.activity = replaceByName(application.activity, {
      $: {
        "android:name": `${pkg}.${ACTIVITY}`,
        "android:exported": "true",
        "android:theme": "@android:style/Theme.NoDisplay",
      },
      "intent-filter": [
        { action: [{ $: { "android:name": "androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE" } }] },
      ],
    });
    // Android 14 and later look for this alias instead of the action above.
    application["activity-alias"] = replaceByName(application["activity-alias"], {
      $: {
        "android:name": `${pkg}.ViewPermissionUsageActivity`,
        "android:exported": "true",
        "android:targetActivity": `${pkg}.${ACTIVITY}`,
        "android:permission": "android.permission.START_VIEW_PERMISSION_USAGE",
      },
      "intent-filter": [
        {
          action: [{ $: { "android:name": "android.intent.action.VIEW_PERMISSION_USAGE" } }],
          category: [{ $: { "android:name": "android.intent.category.HEALTH_PERMISSIONS" } }],
        },
      ],
    });
    return config;
  });

module.exports = function withHealthConnectRationale(config) {
  return withRationaleManifest(withRationaleSource(config));
};
