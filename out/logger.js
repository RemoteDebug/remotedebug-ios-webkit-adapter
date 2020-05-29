"use strict";
//
// Copyright (C) Microsoft. All rights reserved.
//
Object.defineProperty(exports, "__esModule", { value: true });
const createDebug = require("debug");
class LoggerUtil {
    constructor() {
    }
    log(msg) {
        console.log.apply(this, Array.prototype.slice.call(arguments));
    }
    error(msg) {
        console.error(msg);
    }
}
exports.debug = createDebug('remotedebug');
exports.Logger = new LoggerUtil();
