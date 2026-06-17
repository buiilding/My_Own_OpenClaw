"use strict";
/**
 * Provides compatibility exports for the historical Windie-prefixed managed session module.
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
exports.createManagedWindieAgentSession = exports.ManagedWindieAgentSession = void 0;
__exportStar(require("./ManagedAgentSession.js"), exports);
var ManagedAgentSession_js_1 = require("./ManagedAgentSession.js");
Object.defineProperty(exports, "ManagedWindieAgentSession", { enumerable: true, get: function () { return ManagedAgentSession_js_1.ManagedAgentSession; } });
Object.defineProperty(exports, "createManagedWindieAgentSession", { enumerable: true, get: function () { return ManagedAgentSession_js_1.createManagedAgentSession; } });
