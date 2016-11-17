//
// Copyright (C) Microsoft. All rights reserved.
//

import * as http from 'http';
import * as ws from 'ws';
import { Server as WebSocketServer } from 'ws';
import { EventEmitter } from 'events';
import { AdapterCollection } from './adapters/adapterCollection';
import { AllAdapters } from './adapters/allAdapters';
import { Logger } from './logger';
import { Multiplexor } from './multiplexor';

export class ProxyServer extends EventEmitter {
    private _hs: http.Server;
    private _wss: WebSocketServer;
    private _serverPort: number;
    private _adapterCollection: AdapterCollection;
    private _clients: Map<ws, string>;
    private _multiplexor: Multiplexor;

    constructor() {
        super();
        process.on('SIGINT', () => this.stop());
        process.on('SIGTERM', () => this.stop());

        this._multiplexor = new Multiplexor();

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

        this._adapterCollection = new AllAdapters(`ws://localhost:${port}`);
        this._adapterCollection.start();
        this._adapterCollection.on('socketClosed', (id) => {
            this.emit('socketClosed', id);
        });

        return port;
    }

    public stop(): void {
        if (this._hs) {
            this._hs.close();
            this._hs = null;
        }

        this._adapterCollection.stop();
    }

    private onServerRequest(request: http.IncomingMessage, response: http.ServerResponse): void {
        // Normalize request url
        let url = request.url.trim().toLocaleLowerCase();
        if (url.lastIndexOf('/') === url.length - 1) {
            url = url.substr(0, url.length - 1);
        }
        Logger.log(`server.onServerRequest`, url)

        // This is a work around to the fact that the server does not always refresh as expected
        // We still parse the json as normal, but also kill and restart the server
        if (url === '/json?forcerefresh=true') {
            this._adapterCollection.forceRefresh();
            this.emit('forceRefresh');
            url = '/json';
        }

        if (url === ('/json') || url === '/json/list') {
            // Respond with json
            this._adapterCollection.getTargets().then((targets) => {
                response.writeHead(200, { 'Content-Type': 'text/json' });
                response.write(JSON.stringify(targets));
                response.end();
            });
        } else if (url === '/json/version') {

            let data = {
                "Browser": "Chrome/56.0.2920.0",
                "Protocol-Version": "1.2",
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/56.0.2920.0 Safari/537.36",
                "WebKit-Version": "537.36 (@378fc3fd49ebb678fc98cd99831b858fd304691f)"
            }

            response.writeHead(200, { 'Content-Type': 'text/json' });
            response.write(JSON.stringify(data));
            response.end();
        } else if (url === '/protocol.json') {
            // Write out protocol.json file
            response.writeHead(200, { 'Content-Type': 'text/json' });
            response.end();
        } else if (url === '') {
            // Respond with attach page
            response.writeHead(200, { 'Content-Type': 'text/html' });
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

        if (this._multiplexor && url.substr(1, 6) === 'chrome') {
            // The experimental multiplexing option is on and we are connecting to a chrome instance
            // So multiplex to the first ios target
            this._adapterCollection.getTargets().then((targets) => {
                for (let i = 0; i < targets.length; i++) {
                    if (targets[i].adapterType === '_ios') {
                        this._multiplexor.start(ws, targets[i].webSocketDebuggerUrl);
                        break;
                    }
                }
            });

            connection = this._multiplexor;
        }

        this._adapterCollection.connectTo(url, ws);
        connection.on('message', (msg) => {
            this._adapterCollection.forwardTo(url, msg);
        });
    }
}
