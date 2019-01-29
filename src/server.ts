//
// Copyright (C) Microsoft. All rights reserved.
//

import * as http from 'http';
import * as express from 'express';
import * as ws from 'ws';
import { Server as WebSocketServer } from 'ws';
import { EventEmitter } from 'events';
import { Logger, debug } from './logger';

import { Adapter } from './adapters/adapter';
import { IOSAdapter } from './adapters/iosAdapter';
import { IIOSDeviceTarget, IIOSProxySettings } from './adapters/adapterInterfaces';
// import { TestAdapter } from './adapters/testAdapter';

export class ProxyServer extends EventEmitter {
    private _hs: http.Server;
    private _es: express.Application;
    private _wss: WebSocketServer;
    private _serverPort: number;
    private _adapter: Adapter;
    private _clients: Map<ws, string>;
    private _targetFetcherInterval: NodeJS.Timer;

    constructor() {
        super();
    }

    public async run(serverPort: number): Promise<number> {
        this._serverPort = serverPort;
        this._clients = new Map<ws, string>();

        debug('server.run, port=%s', serverPort)

        this._es = express();
        this._hs = http.createServer(this._es);
        this._wss = new WebSocketServer({
            server: this._hs
        });
        this._wss.on('connection', (a) => this.onWSSConnection(a));

        this.setupHttpHandlers();

        // Start server and return the port number
        this._hs.listen(this._serverPort);
        const port = this._hs.address().port;

        // const settings = await IOSAdapter.getProxySettings({
        //     proxyPath: null,
        //     proxyPort: (port + 100),
        //     proxyArgs: null
        // });
        const proxyPort = port + 100
        const deviceId = '3fd3ef5648eeed4795e22ed002f6e6fcd2d32b3b';
        const settings = {
            proxyPath: '/usr/local/bin/ios_webkit_debug_proxy',
            proxyPort: proxyPort,
            proxyArgs: [
                '--no-frontend',
                '--config=' + deviceId + ':' + proxyPort
            ]
        };
        const deviceTarget = {
            deviceId: deviceId,
            deviceName: deviceId,
            url: 'localhost:' + proxyPort,
            version: ''
        };

        this._adapter = new IOSAdapter(`/ios`, `ws://localhost:${port}`, <IIOSProxySettings>settings, <IIOSDeviceTarget> deviceTarget);
        
        return this._adapter.start().then(() => {
            this.startTargetFetcher();
        }).then(() => {
            return port
        })
        
    }

    public stop(): void {

        debug('server.stop')

        if (this._hs) {
            this._hs.close();
            this._hs = null;
        }

        this.stopTargetFetcher();
        this._adapter.stop();
    }

    private startTargetFetcher(): void {

        debug('server.startTargetFetcher')

        var fetch = () => {
            this._adapter.getTargets().then((targets) => {
                debug(`server.startTargetFetcher.fetched.${targets.length}`)
            }, (err) => {
                debug(`server.startTargetFetcher.error`, err``)
            })
        }

        this._targetFetcherInterval = setInterval(fetch, 5000)
    }

    private stopTargetFetcher(): void {
        debug('server.stopTargetFetcher')
        if (!this._targetFetcherInterval) {
            return
        }
        clearInterval(this._targetFetcherInterval)
    }

    private setupHttpHandlers(): void {
        debug('server.setupHttpHandlers')

        this._es.get('/', (req, res) => {
            debug('server.http.endpoint/')
            res.json({
                msg: 'Hello from RemoteDebug iOS WebKit Adapter'
            });
        });

        this._es.get('/refresh', (req, res) => {
            this._adapter.forceRefresh();
            this.emit('forceRefresh');
            res.json({
                status: 'ok'
            });
        });

        this._es.get('/json', (req, res) => {
            debug('server.http.endpoint/json')
            this._adapter.getTargets().then((targets) => {
                res.json(targets);
            });
        });

        this._es.get('/json/list', (req, res) => {
            debug('server.http.endpoint/json/list')
            this._adapter.getTargets().then((targets) => {
                res.json(targets);
            });
        });

        this._es.get('/json/version', (req, res) => {
            debug('server.http.endpoint/json/version')
            res.json({
                'Browser': 'Safari/RemoteDebug iOS Webkit Adapter',
                'Protocol-Version': '1.2',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/57.0.2926.0 Safari/537.36',
                'WebKit-Version': '537.36 (@da59d418f54604ba2451cd0ef3a9cd42c05ca530)'
            });
        });

        this._es.get('/json/protocol', (req, res) => {
            debug('server.http.endpoint/json/protocol')
            res.json();
        });

    }

    private onWSSConnection(ws: ws): void {
        const url = ws.upgradeReq.url;

        debug('server.ws.onWSSConnection', url)

        Logger.log(`New websocket connection to ${url}`);

        let connection = <EventEmitter>ws;

        try {
            this._adapter.connectTo(url, ws);
        }
        catch (err) {
            debug(`server.onWSSConnection.connectTo.error.${err}`)
        }

        connection.on('message', (msg) => {
            this._adapter.forwardTo(url, msg);
        });
    }
}