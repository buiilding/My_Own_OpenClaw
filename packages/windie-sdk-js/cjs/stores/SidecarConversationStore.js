"use strict";
/**
 * Compatibility exports for the previous sidecar-named SDK conversation store module.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SidecarConversationStore = exports.LocalRuntimeConversationStore = void 0;
var LocalRuntimeConversationStore_js_1 = require("./LocalRuntimeConversationStore.js");
Object.defineProperty(exports, "LocalRuntimeConversationStore", { enumerable: true, get: function () { return LocalRuntimeConversationStore_js_1.LocalRuntimeConversationStore; } });
Object.defineProperty(exports, "SidecarConversationStore", { enumerable: true, get: function () { return LocalRuntimeConversationStore_js_1.LocalRuntimeConversationStore; } });
