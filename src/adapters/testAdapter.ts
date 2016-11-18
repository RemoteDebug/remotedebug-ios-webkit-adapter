//
// Copyright (C) Microsoft. All rights reserved.
//

import * as fs from 'fs';
import { Adapter } from './adapter';
import * as path from 'path';
import { ITarget } from './adapterInterfaces';

export class TestAdapter extends Adapter {
    private _jsonPath: string;

    constructor(id: string, proxyUrl: string) {
        super(id, proxyUrl, {});

        this._jsonPath = path.join(__dirname, '../../src/lib/test-targets.json');
    }

    public getTargets(): Promise<ITarget[]> {
        const count = 10;
        return new Promise((resolve, reject) => {
            fs.readFile(this._jsonPath, 'utf8', (error: any, data: string) => {
                if (error) {
                    resolve([]);
                    return;
                }

                const targets: ITarget[] = [];
                const rawTargets: ITarget[] = JSON.parse(data);
                for (let i = 0; i < count; i++) {
                    let t = (i < rawTargets.length ? rawTargets[i] : rawTargets[0]);
                    targets.push(this.setTargetInfo(t));
                }

                resolve(targets);
            });
        });
    }
}
