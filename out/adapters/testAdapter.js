"use strict";
//
// Copyright (C) Microsoft. All rights reserved.
//
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const adapter_1 = require("./adapter");
const path = require("path");
class TestAdapter extends adapter_1.Adapter {
    constructor(id, proxyUrl) {
        super(id, proxyUrl, {});
        this._jsonPath = path.join(__dirname, '../../src/lib/test-targets.json');
    }
    getTargets() {
        const count = 10;
        return new Promise((resolve, reject) => {
            fs.readFile(this._jsonPath, 'utf8', (error, data) => {
                if (error) {
                    resolve([]);
                    return;
                }
                const targets = [];
                const rawTargets = JSON.parse(data);
                for (let i = 0; i < count; i++) {
                    let t = (i < rawTargets.length ? rawTargets[i] : rawTargets[0]);
                    targets.push(this.setTargetInfo(t));
                }
                resolve(targets);
            });
        });
    }
}
exports.TestAdapter = TestAdapter;
