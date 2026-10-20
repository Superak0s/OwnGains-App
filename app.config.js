const fs = require("fs");
const path = require("path");

// google-services.json comes from the Firebase console and turns on FCM push
// and Firebase Analytics. Builds without it still work: messages arrive over
// the socket only and usage metrics are not sent.
module.exports = ({ config, projectRoot }) =>
  fs.existsSync(path.join(projectRoot, "google-services.json"))
    ? {
        ...config,
        android: { ...config.android, googleServicesFile: "./google-services.json" },
        plugins: [...config.plugins, "@react-native-firebase/app"],
      }
    : config;
