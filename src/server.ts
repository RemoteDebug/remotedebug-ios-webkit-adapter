//
// Copyright (C) Microsoft. All rights reserved.
//

import * as http from 'http';
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

        this._hs = http.createServer((a, b) => this.onServerRequest(a, b));
        this._wss = new WebSocketServer({ server: this._hs });
        this._wss.on('connection', (a) => this.onWSSConnection(a));

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

    private onServerRequest(request: http.IncomingMessage, response: http.ServerResponse): void {
        // Normalize request url
        let url = request.url.trim().toLocaleLowerCase();
        if (url.lastIndexOf('/') === url.length - 1) {
            url = url.substr(0, url.length - 1);
        }
        Logger.log(`server.onServerRequest`, url);

        // This is a work around to the fact that the server does not always refresh as expected
        // We still parse the json as normal, but also kill and restart the server
        if (url === '/refresh') {
            this._adapter.forceRefresh();
            this.emit('forceRefresh');
            response.writeHead(200, { 'Content-Type': 'text/html' });
            response.end();
        } else if (url === ('/json') || url === '/json/list') {
            // Respond with json
            this._adapter.getTargets().then((targets) => {
                response.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
                response.write(JSON.stringify(targets, null, 2));
                response.end();
            });
        } else if (url === '/json/version') {

            let data = [
                {
                    'Browser': 'Safari',
                    'Protocol-Version': '1.2'
                }
            ];

            response.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
            response.write(JSON.stringify(data, null, 2));
            response.end();
        } else if (url === '/protocol.json') {
            // Write out protocol.json file
            response.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
            response.end();
        } else if (url === '' || url === '/') {
            // Respond with attach page
            response.writeHead(200, { 'Content-Type': 'text/html' });
            response.write('Hello from RemoteDebug iOS WebKit Adapter');
            response.end();
        } else {
            // Not found
            response.writeHead(404, { 'Content-Type': 'text/html' });
            response.end();
        }
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