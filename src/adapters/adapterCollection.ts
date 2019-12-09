//
// Copyright (C) Microsoft. All rights reserved.
//

import * as WebSocket from 'ws';
import { ITarget, IAdapterOptions } from './adapterInterfaces';
import { Adapter } from './adapter';
import { Target } from '../protocols/target';
import { debug } from '../logger';

export class AdapterCollection extends Adapter {
    protected _adapters: Map<string, Adapter>;

    constructor(id: string, proxyUrl: string, options: IAdapterOptions) {
        super(id, proxyUrl, options);

        this._adapters = new Map<string, Adapter>();
    }

    public start(): Promise<any> {
        debug(`adapterCollection.start`, this._adapters);

        const startPromises = [super.start()];

        this._adapters.forEach((adapter) => {
            startPromises.push(adapter.start());
        });

        return Promise.all(startPromises);
    }

    public stop(): void {
        debug(`adapterCollection.stop`);
        super.stop();
        this._adapters.forEach((adapter) => {
            adapter.stop();
        });
    }

    public forceRefresh(): void {
        debug(`adapterCollection.forceRefresh`);
        super.forceRefresh();
        this._adapters.forEach((adapter) => {
            adapter.forceRefresh();
        });
    }

    public getTargets(metadata?: any): Promise<ITarget[]> {
        return new Promise((resolve, reject) => {
            const promises: Promise<ITarget[]>[] = [];

            let index = 0;
            this._adapters.forEach((adapter) => {
                let targetMetadata = null;
                if (metadata) {
                    targetMetadata = (metadata.constructor === Array ? metadata[index] : metadata);
                }
                promises.push(adapter.getTargets(targetMetadata));
                index++;
            });

            Promise.all(promises).then((results: ITarget[][]) => {
                let allTargets = [];
                results.forEach((targets) => {
                    allTargets = allTargets.concat(targets);
                });
                resolve(allTargets);
            });
        });
    }

    public connectTo(url: string, wsFrom: WebSocket): Target {
        debug(`adapterCollection.connectTo, url=${url}`);
        const id = this.getWebSocketId(url);

        let target: Target = null;
        if (this._adapters.has(id.adapterId)) {
            target = this._adapters.get(id.adapterId).connectTo(id.targetId, wsFrom);
        }

        return target;
    }

    public forwardTo(url: string, message: string): void {
        debug(`adapterCollection.forwardTo, url=${url}`);
        const id = this.getWebSocketId(url);

        if (this._adapters.has(id.adapterId)) {
            this._adapters.get(id.adapterId).forwardTo(id.targetId, message);
        }
    }

    private getWebSocketId(url: string): { adapterId: string, targetId: string } {
        debug(`adapterCollection.getWebSocketId, url=${url}`);
        const index = url.indexOf('/', 1);
        const adapterId = url.substr(0, index);
        const targetId = url.substr(index + 1);

        return { adapterId: adapterId, targetId: targetId };
    }
}
