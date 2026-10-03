const fs = require("node:fs");
const path = require("node:path");
const { withAndroidManifest, withDangerousMod } = require("@expo/config-plugins");

// Android's network security config cannot express address ranges, only exact
// hosts, so "plaintext to RFC 1918 only" is not expressible here. Self-hosted
// LAN servers use arbitrary private addresses, so the base config
// stays permissive and `assertSecureTransport` in src/shared/services/config.tsx
// enforces the private-host rule on every request instead.
//
// This file pins the default server: nothing should ever reach
// owngains.superak0s.com over plaintext, whatever the client believes. Keep this
// in sync with DEFAULT_API_BASE_URL.
const PINNED_HTTPS_DOMAIN = "superak0s.com";

const CONFIG_XML = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="true">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
    <domain-config cleartextTrafficPermitted="false">
        <domain includeSubdomains="true">${PINNED_HTTPS_DOMAIN}</domain>
    </domain-config>
</network-security-config>
`;

// User-installed CAs are deliberately absent from the trust anchors above:
// a self-hosted server uses a real certificate or a private address over
// plaintext, neither of which needs one, and omitting them blocks casual
// interception proxies on a compromised device.

const withNetworkSecurityConfigFile = (config) =>
  withDangerousMod(config, [
    "android",
    async (config) => {
      const xmlDir = path.join(
        config.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "res",
        "xml",
      );
      await fs.promises.mkdir(xmlDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(xmlDir, "network_security_config.xml"),
        CONFIG_XML,
        "utf8",
      );
      return config;
    },
  ]);

const withNetworkSecurityManifest = (config) =>
  withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application?.[0];
    if (!application) return config;
    application.$ = {
      ...application.$,
      "android:networkSecurityConfig": "@xml/network_security_config",
    };
    return config;
  });

module.exports = function withAndroidNetworkSecurity(config) {
  return withNetworkSecurityManifest(withNetworkSecurityConfigFile(config));
};
