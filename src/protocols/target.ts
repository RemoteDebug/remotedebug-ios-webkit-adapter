//
// Copyright (C) Microsoft. All rights reserved.
//

import * as WebSocket from 'ws';
import { EventEmitter } from 'events';
import { Logger, debug } from '../logger';
import { ITarget } from '../adapters/adapterInterfaces';

export class Target extends EventEmitter {
    private _data: ITarget;
    private _url: string;
    private _wsTarget: WebSocket;
    private _wsTools: WebSocket;
    private _isConnected: boolean;
    private _messageBuffer: string[];
    private _messageFilters: Map<string, ((msg: any) => Promise<any>)[]>;
    private _toolRequestMap: Map<number, string>;
    private _adapterRequestMap: Map<number, { resolve: (any) => void, reject: (any) => void }>;
    private _requestId: number;
    private _id: string;
    private _targetBased: boolean;
    private _targetId: string;

    constructor(targetId: string, data?: ITarget) {
        super();
        this._data = data;
        this._messageBuffer = [];
        this._messageFilters = new Map<string, ((msg: any) => Promise<any>)[]>();
        this._toolRequestMap = new Map<number, string>();
        this._adapterRequestMap = new Map<number, { resolve: (any) => void, reject: (any) => void }>();
        this._requestId = 0;
        this._targetBased = false;
        this._targetId = null;

        // Chrome currently uses id, iOS usies appId
        this._id = targetId;
    }

    public get data(): ITarget {
        return this._data;
    }

    public set targetBased(isTargetBased: boolean) {
        this._targetBased = isTargetBased;
    }

    public set targetId(targetId: string) {
        this._targetId = targetId;
    }

    public connectTo(url: string, wsFrom: WebSocket): void {
        if (this._wsTarget) {
            Logger.error(`Already connected`);
            return;
        }

        this._url = url;
        this._wsTools = wsFrom;

        // Create a connection to the real websocket endpoint
        this._wsTarget = new WebSocket(url);
        this._wsTarget.on('error', (err) => {
            Logger.error(err);
        });

        this._wsTarget.on('message', (message) => {
            this.onMessageFromTarget(message);
        });
        this._wsTarget.on('open', () => {
            debug(`Connection established to ${url}`);
            this._isConnected = true;
            for (let i = 0; i < this._messageBuffer.length; i++) {
                this.onMessageFromTools(this._messageBuffer[i]);
            }
            this._messageBuffer = [];
        });
        this._wsTarget.on('close', () => {
            debug('Socket is closed');
        });
    }

    public forward(message: string): void {
        if (!this._wsTarget) {
            Logger.error('No websocket endpoint found');
            return;
        }

        this.onMessageFromTools(message);
    }

    public updateClient(wsFrom: WebSocket): void {
        if (this._wsTarget) {
            this._wsTarget.close();
        }
        this._wsTarget = null;
        this.connectTo(this._url, wsFrom);
    }

    public addMessageFilter(method: string, filter: (msg: any) => Promise<any>): void {
        if (!this._messageFilters.has(method)) {
            this._messageFilters.set(method, []);
        }

        this._messageFilters.get(method).push(filter);
    }

    public callTarget(method: string, params: any): Promise<any> {
        return new Promise((resolve, reject) => {
            const request = {
                id: --this._requestId,
                method: method,
                params: params
            };

            this._adapterRequestMap.set(request.id, { resolve: resolve, reject: reject });
            this.sendToTarget(JSON.stringify(request));
        });
    }

    public fireEventToTools(method: string, params: any): void {
        const response = {
            method: method,
            params: params
        };

        this.sendToTools(JSON.stringify(response));
    }

    public fireResultToTools(id: number, params: any): void {
        const response = {
            id: id,
            result: params
        };

        this.sendToTools(JSON.stringify(response));
    }

    public replyWithEmpty(msg: any): Promise<any> {
        this.fireResultToTools(msg.id, {});
        return Promise.resolve(null);
    }

    private onMessageFromTools(rawMessage: string): void {
        if (!this._isConnected) {
            debug('Connection not yet open, buffering message.');
            this._messageBuffer.push(rawMessage);
            return;
        }

        const msg = JSON.parse(rawMessage);
        const eventName = `tools::${msg.method}`;

        this._toolRequestMap.set(msg.id, msg.method);
        this.emit(eventName, msg.params);

        if (this._messageFilters.has(eventName)) {
            let sequence = Promise.resolve(msg);

            this._messageFilters.get(eventName).forEach((filter) => {
                sequence = sequence.then((filteredMessage) => {
                    return filter(filteredMessage);
                });
            });

            sequence.then((filteredMessage) => {
                // Only send on the message if it wasn't completely filtered out
                if (filteredMessage) {
                    rawMessage = JSON.stringify(filteredMessage);
                    this.sendToTarget(rawMessage);
                }
            });
        } else {
            // Pass it on to the target
            this.sendToTarget(rawMessage);
        }
    }

    private onMessageFromTarget(rawMessage: string): void {
        let msg = JSON.parse(rawMessage);

        if (this._targetBased) {
            if (!msg.method || !msg.method.match(/^Target/)) {
                return;
            }
            if (msg.method === 'Target.dispatchMessageFromTarget') {
                rawMessage = msg.params.message;
                msg = JSON.parse(rawMessage);
            }
        }

        if ('id' in msg) {
            if (this._toolRequestMap.has(msg.id)) {
                // Reply to tool request
                let eventName = `target::${this._toolRequestMap.get(msg.id)}`;
                this.emit(eventName, msg.params);

                this._toolRequestMap.delete(msg.id);

                if ('error' in msg && this._messageFilters.has('target::error')) {
                    eventName = 'target::error';
                }

                if (this._messageFilters.has(eventName)) {
                    let sequence = Promise.resolve(msg);

                    this._messageFilters.get(eventName).forEach((filter) => {
                        sequence = sequence.then((filteredMessage) => {
                            return filter(filteredMessage);
                        });
                    });

                    sequence.then((filteredMessage) => {
                        rawMessage = JSON.stringify(filteredMessage);
                        this.sendToTools(rawMessage);
                    });
                } else {
                    // Pass it on to the tools
                    this.sendToTools(rawMessage);
                }
            } else if (this._adapterRequestMap.has(msg.id)) {
                // Reply to adapter request
                const resultPromise = this._adapterRequestMap.get(msg.id);
                this._adapterRequestMap.delete(msg.id);

                if ('result' in msg) {
                    resultPromise.resolve(msg.result);
                } else if ('error' in msg) {
                    resultPromise.reject(msg.error);
                } else {
                    Logger.error(`Unhandled type of request message from target ${rawMessage}`);
                }
            } else {
                Logger.error(`Unhandled message from target ${rawMessage}`);
            }
        } else {
            const eventName = `target::${msg.method}`;
            this.emit(eventName, msg);

            if (this._messageFilters.has(eventName)) {
                let sequence = Promise.resolve(msg);

                this._messageFilters.get(eventName).forEach((filter) => {
                    sequence = sequence.then((filteredMessage) => {
                        return filter(filteredMessage);
                    });
                });

                sequence.then((filteredMessage) => {
                    rawMessage = JSON.stringify(filteredMessage);
                    this.sendToTools(rawMessage);
                });
            } else {
                // Pass it on to the tools
                this.sendToTools(rawMessage);
            }
        }
    }

    private sendToTools(rawMessage: string): void {
        debug(`sendToTools.${rawMessage}`);
        // Make sure the tools socket can receive messages
        if (this.isSocketConnected(this._wsTools)) {
            this._wsTools.send(rawMessage);
        }
    }

    private sendToTarget(rawMessage: string): void {
        debug(`sendToTarget.${rawMessage}`);
        if (this._targetBased) {
            const message = JSON.parse(rawMessage);
            if (!message.method.match(/^Target/)) {
                const newMessage = {
                    id: message.id,
                    method: 'Target.sendMessageToTarget',
                    params: {
                        id: message.id,
                        message: JSON.stringify(message),
                        targetId: this._targetId
                    }
                };
                rawMessage = JSON.stringify(newMessage);
                debug(`sendToTarget.targeted.${rawMessage}`);
            }
        }

        // Make sure the target socket can receive messages
        if (this.isSocketConnected(this._wsTarget)) {
            this._wsTarget.send(rawMessage);
        } else {
            // The socket has closed, we should send this message up to the parent
            this._wsTarget = null;
            this.emit('socketClosed', this._id);
        }
    }

    private isSocketConnected(ws: WebSocket): boolean {
        return ws && (ws.readyState === WebSocket.OPEN);
    }
}
