"use strict";
//
// Copyright (C) Microsoft. All rights reserved.
//
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const http = require("http");
const express = require("express");
const ws_1 = require("ws");
const events_1 = require("events");
const logger_1 = require("./logger");
const iosAdapter_1 = require("./adapters/iosAdapter");
// import { TestAdapter } from './adapters/testAdapter';
class ProxyServer extends events_1.EventEmitter {
    constructor() {
        super();
    }
    run(serverPort) {
        return __awaiter(this, void 0, void 0, function* () {
            this._serverPort = serverPort;
            this._clients = new Map();
            logger_1.debug('server.run, port=%s', serverPort);
            this._es = express();
            this._hs = http.createServer(this._es);
            this._wss = new ws_1.Server({
                server: this._hs
            });
            this._wss.on('connection', (a, req) => this.onWSSConnection(a, req));
            this.setupHttpHandlers();
            // Start server and return the port number
            this._hs.listen(this._serverPort);
            const port = this._hs.address().port;
            const settings = yield iosAdapter_1.IOSAdapter.getProxySettings({
                proxyPath: null,
                proxyPort: (port + 100),
                proxyArgs: null
            });
            this._adapter = new iosAdapter_1.IOSAdapter(`/ios`, `ws://localhost:${port}`, settings);
            return this._adapter.start().then(() => {
                this.startTargetFetcher();
            }).then(() => {
                return port;
            });
        });
    }
    stop() {
        logger_1.debug('server.stop');
        if (this._hs) {
            this._hs.close();
            this._hs = null;
        }
        this.stopTargetFetcher();
        this._adapter.stop();
    }
    startTargetFetcher() {
        logger_1.debug('server.startTargetFetcher');
        let fetch = () => {
            this._adapter.getTargets().then((targets) => {
                logger_1.debug(`server.startTargetFetcher.fetched.${targets.length}`);
            }, (err) => {
                logger_1.debug(`server.startTargetFetcher.error`, err ``);
            });
        };
        this._targetFetcherInterval = setInterval(fetch, 5000);
    }
    stopTargetFetcher() {
        logger_1.debug('server.stopTargetFetcher');
        if (!this._targetFetcherInterval) {
            return;
        }
        clearInterval(this._targetFetcherInterval);
    }
    setupHttpHandlers() {
        logger_1.debug('server.setupHttpHandlers');
        this._es.get('/', (req, res) => {
            logger_1.debug('server.http.endpoint/');
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
            logger_1.debug('server.http.endpoint/json');
            this._adapter.getTargets().then((targets) => {
                res.json(targets);
            });
        });
        this._es.get('/json/list', (req, res) => {
            logger_1.debug('server.http.endpoint/json/list');
            this._adapter.getTargets().then((targets) => {
                res.json(targets);
            });
        });
        this._es.get('/json/version', (req, res) => {
            logger_1.debug('server.http.endpoint/json/version');
            res.json({
                'Browser': 'Safari/RemoteDebug iOS Webkit Adapter',
                'Protocol-Version': '1.2',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/57.0.2926.0 Safari/537.36',
                'WebKit-Version': '537.36 (@da59d418f54604ba2451cd0ef3a9cd42c05ca530)'
            });
        });
        this._es.get('/json/protocol', (req, res) => {
            logger_1.debug('server.http.endpoint/json/protocol');
            res.json();
        });
    }
    onWSSConnection(websocket, req) {
        const url = req.url;
        logger_1.debug('server.ws.onWSSConnection', url);
        let connection = websocket;
        try {
            this._adapter.connectTo(url, websocket);
        }
        catch (err) {
            logger_1.debug(`server.onWSSConnection.connectTo.error.${err}`);
        }
        connection.on('message', (msg) => {
            this._adapter.forwardTo(url, msg);
        });
    }
}
exports.ProxyServer = ProxyServer;
