const fs = require("fs");
const path = require("path");

// google-services.json comes from the Firebase console and turns on FCM push
// and Firebase Analytics. Builds without it still work: messages arrive over
// the socket only and usage metrics are not sent.
const GOOGLE_SERVICES = ["./secrets/google-services.json", "./google-services.json"];

module.exports = ({ config, projectRoot }) => {
  const file = GOOGLE_SERVICES.find((p) => fs.existsSync(path.join(projectRoot, p)));
  return file
    ? {
        ...config,
        android: { ...config.android, googleServicesFile: file },
        plugins: [...config.plugins, "@react-native-firebase/app"],
      }
    : config;
};
