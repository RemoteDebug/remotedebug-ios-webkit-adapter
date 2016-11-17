//
// Copyright (C) Microsoft. All rights reserved.
//

import * as WebSocket from 'ws';
import { EventEmitter } from 'events';
import { diff } from 'deep-diff';
import { Logger } from './logger';

export class Multiplexor extends EventEmitter {
    private _socketFromTools: WebSocket;
    private _socketToMultiplexTarget: WebSocket;
    private _messageBuffer: string[];
    private _isConnected: boolean;
    private _multiplexCompareStack: Map<number, any>;

    constructor() {
        super();

        this._messageBuffer = [];
        this._multiplexCompareStack = new Map<number, any>();
    }

    public start(realToolsSocket: WebSocket, multiplexToUrl: string): void {
        this._socketFromTools = realToolsSocket;

        const originalSend = this._socketFromTools.send;
        this._socketFromTools.send = (m) => {
            // From target to tools
            const item = JSON.parse(m);
            if ('id' in item) {
                this._multiplexCompareStack.set(item.id, item);
            }
            originalSend.call(this._socketFromTools, m);
        };

        this._socketFromTools.on('message', (msg) => {
            // From tools to target
            if (!this._isConnected) {
                // Not connected, so store the message until we connect
                this._messageBuffer.push(msg);
            } else {
                // Forward to the connected multiplex target
                this._socketToMultiplexTarget.send(msg);
            }

            this.emit('message', msg);
        });

        this._socketToMultiplexTarget = new WebSocket(multiplexToUrl);
        this._socketToMultiplexTarget.on('open', () => {
            // Fire any buffered messages
            for (let i = 0; i < this._messageBuffer.length; i++) {
                this._socketToMultiplexTarget.send(this._messageBuffer[i]);
            }
            this._isConnected = true;
            this._messageBuffer = [];
        });

        this._socketToMultiplexTarget.on('message', (msg) => {
            // From target to tools
            const ios = JSON.parse(msg);
            if ('id' in ios && this._multiplexCompareStack.has(ios.id)) {
                const chrome = this._multiplexCompareStack.get(ios.id);
                this._multiplexCompareStack.delete(ios.id);

                // Compare the 2 items
                try {
                    const d = diff(chrome, ios);
                    if (d) {
                        Logger.log(JSON.stringify(d));
                    }
                } catch (ex) {
                }
            }
        });
    }
}
