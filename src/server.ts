//
// Copyright (C) Microsoft. All rights reserved.
//

import * as http from 'http';
import * as express from 'express';
import * as ws from 'ws';
import { Server as WebSocketServer } from 'ws';
import { EventEmitter } from 'events';
import { Logger } from './logger';

import { Adapter } from './adapters/adapter';
import { IOSAdapter } from './adapters/iosAdapter';
import { IIOSProxySettings } from './adapters/adapterInterfaces';
// import { TestAdapter } from './adapters/testAdapter';

export class ProxyServer extends EventEmitter {
    private _hs: http.Server;
    private _es: express;
    private _wss: WebSocketServer;
    private _serverPort: number;
    private _adapter: Adapter;
    private _clients: Map<ws, string>;

    constructor() {
        super();
        process.on('SIGINT', () => this.stop());
        process.on('SIGTERM', () => this.stop());
    }

    public run(serverPort: number): number {
        this._serverPort = serverPort;
        this._clients = new Map<ws, string>();

        this._es = express()
        this._hs = http.createServer(this._es)
        this._wss = new WebSocketServer({
            server: this._hs
        });
        this._wss.on('connection', (a) => this.onWSSConnection(a));

        this.setupHttpHandlers();

        // Start server and return the port number
        this._hs.listen(this._serverPort);
        const port = this._hs.address().port;

        const settings = IOSAdapter.getProxySettings({
            proxyPath: null,
            proxyPort: (port + 100),
            proxyArgs: null
        });

        this._adapter = new IOSAdapter(`/ios`, `ws://localhost:${port}`, <IIOSProxySettings>settings);
        // this._adapter = new TestAdapter('/test', `ws://localhost:${port}`);
        this._adapter.start();

        return port;
    }

    public stop(): void {
        if (this._hs) {
            this._hs.close();
            this._hs = null;
        }

        this._adapter.stop();
    }

    private setupHttpHandlers(): void {

        this._es.get('/', (req, res) => {
            res.json({
                msg: 'Hello from RemoteDebug iOS WebKit Adapter'
            })
        })

        this._es.get('/refresh', (req, res) => {
            this._adapter.forceRefresh();
            this.emit('forceRefresh');
            res.json({
                status: 'ok'
            })
        })

        this._es.get('/json', (req, res) => {
            this._adapter.getTargets().then((targets) => {
                res.json(targets)
            });
        })

        this._es.get('/json/list', (req, res) => {
            this._adapter.getTargets().then((targets) => {
                res.json(targets)
            });
        })

        this._es.get('/json/version', (req, res) => {
            res.json({
                "Browser": "Safari/RemoteDebug iOS Webkit Adapter",
                "Protocol-Version": "1.2",
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/57.0.2926.0 Safari/537.36",
                "WebKit-Version": "537.36 (@da59d418f54604ba2451cd0ef3a9cd42c05ca530)"
            })
        })

        this._es.get('/json/protocol', (req, res) => {
            res.json()
        })

    }

    private onWSSConnection(ws: ws): void {
        const url = ws.upgradeReq.url;
        Logger.log(`New websocket connection to ${url}`);

        let connection = <EventEmitter>ws;

        this._adapter.connectTo(url, ws);
        connection.on('message', (msg) => {
            this._adapter.forwardTo(url, msg);
        });
    }
}