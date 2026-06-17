"use strict";
/**
 * Provides compatibility exports for historical Windie-prefixed local runtime names.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createWindieLocalRuntimeProvider = void 0;
__exportStar(require("./LocalSidecarRuntime.js"), exports);
var LocalSidecarRuntime_js_1 = require("./LocalSidecarRuntime.js");
Object.defineProperty(exports, "createWindieLocalRuntimeProvider", { enumerable: true, get: function () { return LocalSidecarRuntime_js_1.createAgentLocalRuntimeProvider; } });
