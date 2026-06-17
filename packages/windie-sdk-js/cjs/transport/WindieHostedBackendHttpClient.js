"use strict";
/**
 * Provides compatibility exports for historical Windie-prefixed hosted backend client names.
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
exports.WindieSdkClient = void 0;
const HostedBackendHttpClient_js_1 = require("./HostedBackendHttpClient.js");
__exportStar(require("./HostedBackendHttpClient.js"), exports);
Object.defineProperty(exports, "WindieSdkClient", { enumerable: true, get: function () { return HostedBackendHttpClient_js_1.AgentHostedBackendClient; } });
