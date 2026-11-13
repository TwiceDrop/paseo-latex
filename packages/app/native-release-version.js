// Node 22 build tools keep the CommonJS entry point; clients import the shared ESM implementation.
module.exports = require("./native-release-version.mjs");
