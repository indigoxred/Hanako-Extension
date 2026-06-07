const manifest = {
  manifest_version: 3,
  name: "Hanako Manga Translator",
  version: "0.1.0",
  permissions: [
    "storage",
    "contextMenus",
    "activeTab",
    "alarms",
    "scripting",
    "unlimitedStorage"
  ],
  optional_permissions: ["notifications"],
  host_permissions: ["<all_urls>"],
  background: {
    service_worker: "background/service-worker.js",
    type: "module"
  },
  icons: {
    16: "icons/hanako-icon.png",
    32: "icons/hanako-icon.png",
    48: "icons/hanako-icon.png",
    128: "icons/hanako-icon.png"
  },
  action: {
    default_icon: {
      16: "icons/hanako-icon.png",
      32: "icons/hanako-icon.png",
      48: "icons/hanako-icon.png",
      128: "icons/hanako-icon.png"
    },
    default_popup: "popup/popup.html"
  },
  options_page: "options/options.html"
} as const;

export default manifest;
