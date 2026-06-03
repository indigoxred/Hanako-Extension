const manifest = {
  manifest_version: 3,
  name: "Hanako Manga Translator",
  version: "0.1.0",
  permissions: ["storage", "contextMenus", "activeTab", "scripting"],
  optional_permissions: ["notifications"],
  optional_host_permissions: ["<all_urls>"],
  host_permissions: ["http://localhost:8787/*", "http://127.0.0.1:8787/*"],
  background: {
    service_worker: "background/service-worker.js",
    type: "module"
  },
  action: {
    default_popup: "popup/popup.html"
  },
  options_page: "options/options.html"
} as const;

export default manifest;
