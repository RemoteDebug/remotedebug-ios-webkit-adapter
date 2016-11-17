//
// Copyright (C) Microsoft. All rights reserved.
//

import { IIOSProxySettings } from './adapterInterfaces';
import { AdapterCollection } from './adapterCollection';
import { IOSAdapter } from './iosAdapter';
import { TestAdapter } from './testAdapter';

export class AllAdapters extends AdapterCollection {
    constructor(proxyUrl: string) {
        super('', proxyUrl, {});

        const settings = IOSAdapter.getProxySettings({
            proxyPath: null,
            proxyPort: 9400,
            proxyArgs: null
        });

        const ios = new IOSAdapter(`${this._id}/ios`, this._proxyUrl, <IIOSProxySettings>settings);
        this._adapters.set('/ios', ios);

        // const test = new TestAdapter(`${this._id}/test`, this._proxyUrl);
        // this._adapters.set('/test', test);
    
        this._adapters.forEach((adapter) => {
            adapter.on('socketClosed', (id) => {
                this.emit('socketClosed', id);
            });
        });
    }
}
