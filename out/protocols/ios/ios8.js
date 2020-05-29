"use strict";
//
// Copyright (C) Microsoft. All rights reserved.
//
Object.defineProperty(exports, "__esModule", { value: true });
const ios_1 = require("./ios");
const logger_1 = require("../../logger");
class IOS8Protocol extends ios_1.IOSProtocol {
    constructor(target) {
        super(target);
        this._target.addMessageFilter('target::error', (msg) => {
            logger_1.Logger.error('Error received (overriding) ' + JSON.stringify(msg));
            msg = {
                id: msg.id,
                result: {}
            };
            return Promise.resolve(msg);
        });
    }
    mapSelectorList(selectorList) {
        const range = selectorList.range;
        for (let i = 0; i < selectorList.selectors.length; i++) {
            selectorList.selectors[i] = { text: selectorList.selectors[i] };
            if (range !== undefined) {
                selectorList.selectors[i].range = range;
            }
        }
        delete selectorList.range;
    }
}
exports.IOS8Protocol = IOS8Protocol;
