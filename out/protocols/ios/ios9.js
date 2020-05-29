"use strict";
//
// Copyright (C) Microsoft. All rights reserved.
//
Object.defineProperty(exports, "__esModule", { value: true });
const ios_1 = require("./ios");
class IOS9Protocol extends ios_1.IOSProtocol {
    constructor(target) {
        super(target);
    }
    mapSelectorList(selectorList) {
        const range = selectorList.range;
        for (let i = 0; i < selectorList.selectors.length; i++) {
            if (range !== undefined) {
                selectorList.selectors[i].range = range;
            }
        }
        delete selectorList.range;
    }
}
exports.IOS9Protocol = IOS9Protocol;
