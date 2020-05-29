"use strict";
//
// Copyright (C) Microsoft. All rights reserved.
//
Object.defineProperty(exports, "__esModule", { value: true });
const request = require("request");
const events_1 = require("events");
const child_process_1 = require("child_process");
const target_1 = require("../protocols/target");
const logger_1 = require("../logger");
class Adapter extends events_1.EventEmitter {
    constructor(id, socket, options) {
        super();
        this._id = id;
        this._proxyUrl = socket;
        this._targetMap = new Map();
        this._targetIdToTargetDataMap = new Map();
        // Apply default options
        options.pollingInterval = options.pollingInterval || 3000;
        options.baseUrl = options.baseUrl || 'http://127.0.0.1';
        options.path = options.path || '/json';
        options.port = options.port || 9222;
        this._options = options;
        this._url = `${this._options.baseUrl}:${this._options.port}${this._options.path}`;
        const index = this._id.indexOf('/', 1);
        if (index >= 0) {
            this._adapterType = '_' + this._id.substr(1, index - 1);
        }
        else {
            this._adapterType = this._id.replace('/', '_');
        }
    }
    get id() {
        logger_1.debug(`adapter.id`);
        return this._id;
    }
    start() {
        logger_1.debug(`adapter.start`, this._options);
        if (!this._options.proxyExePath) {
            logger_1.debug(`adapter.start: Skip spawnProcess, no proxyExePath available`);
            return Promise.resolve(`skipped`);
        }
        return this.spawnProcess(this._options.proxyExePath, this._options.proxyExeArgs);
    }
    stop() {
        logger_1.debug(`adapter.stop`);
        if (this._proxyProc) {
            // Terminate the proxy process
            this._proxyProc.kill('SIGTERM');
            this._proxyProc = null;
        }
    }
    getTargets(metadata) {
        logger_1.debug(`adapter.getTargets, metadata=${metadata}`);
        return new Promise((resolve, reject) => {
            request(this._url, (error, response, body) => {
                if (error) {
                    resolve([]);
                    return;
                }
                const targets = [];
                const rawTargets = JSON.parse(body);
                rawTargets.forEach((t) => {
                    targets.push(this.setTargetInfo(t, metadata));
                });
                resolve(targets);
            });
        });
    }
    connectTo(targetId, wsFrom) {
        logger_1.debug(`adapter.connectTo, targetId=${targetId}`);
        if (!this._targetIdToTargetDataMap.has(targetId)) {
            logger_1.Logger.error(`No endpoint url found for id ${targetId}`);
            return null;
        }
        else if (this._targetMap.has(targetId)) {
            logger_1.debug(`Existing target found for id ${targetId}`);
            const existingTarget = this._targetMap.get(targetId);
            existingTarget.updateClient(wsFrom);
            return existingTarget;
        }
        const targetData = this._targetIdToTargetDataMap.get(targetId);
        const target = new target_1.Target(targetId, targetData);
        target.connectTo(targetData.webSocketDebuggerUrl, wsFrom);
        // Store the tools websocket for this target
        this._targetMap.set(targetId, target);
        target.on('socketClosed', (id) => {
            this.emit('socketClosed', id);
        });
        return target;
    }
    forwardTo(targetId, message) {
        logger_1.debug(`adapter.forwardTo, targetId=${targetId}`);
        if (!this._targetMap.has(targetId)) {
            logger_1.Logger.error(`No target found for id ${targetId}`);
            return;
        }
        this._targetMap.get(targetId).forward(message);
    }
    forceRefresh() {
        logger_1.debug('adapter.forceRefresh');
        if (this._proxyProc && this._options.proxyExePath && this._options.proxyExeArgs) {
            this.refreshProcess(this._proxyProc, this._options.proxyExePath, this._options.proxyExeArgs);
        }
    }
    setTargetInfo(t, metadata) {
        logger_1.debug('adapter.setTargetInfo', t, metadata);
        // Ensure there is a valid id
        const id = (t.id || t.webSocketDebuggerUrl);
        t.id = id;
        // Set the adapter type
        t.adapterType = this._adapterType;
        t.type = t.type || 'page';
        // Append the metadata
        t.metadata = metadata;
        // Store the real endpoint
        const targetData = JSON.parse(JSON.stringify(t));
        this._targetIdToTargetDataMap.set(t.id, targetData);
        // Overwrite the real endpoint with the url of our proxy multiplexor
        t.webSocketDebuggerUrl = `${this._proxyUrl}${this._id}/${t.id}`;
        let wsUrl = `${this._proxyUrl.replace('ws://', '')}${this._id}/${t.id}`;
        t.devtoolsFrontendUrl = `https://chrome-devtools-frontend.appspot.com/serve_file/@fcea73228632975e052eb90fcf6cd1752d3b42b4/inspector.html?experiments=true&remoteFrontend=screencast&ws=${wsUrl}`;
        return t;
    }
    refreshProcess(process, path, args) {
        logger_1.debug('adapter.refreshProcess');
        process.kill('SIGTERM');
        return this.spawnProcess(path, args);
    }
    spawnProcess(path, args) {
        logger_1.debug(`adapter.spawnProcess, path=${path}`);
        return new Promise((resolve, reject) => {
            if (this._proxyProc) {
                reject('adapter.spawnProcess.error, err=process already started');
            }
            this._proxyProc = child_process_1.spawn(path, args, {
                detached: true,
                stdio: ['ignore']
            });
            this._proxyProc.on('error', err => {
                logger_1.debug(`adapter.spawnProcess.error, err=${err}`);
                reject(`adapter.spawnProcess.error, err=${err}`);
            });
            this._proxyProc.on('close', (code) => {
                logger_1.debug(`adapter.spawnProcess.close, code=${code}`);
                reject(`adapter.spawnProcess.close, code=${code}`);
            });
            this._proxyProc.stdout.on('data', data => {
                logger_1.debug(`adapter.spawnProcess.stdout, data=${data.toString()}`);
            });
            this._proxyProc.stderr.on('data', data => {
                logger_1.debug(`adapter.spawnProcess.stderr, data=${data.toString()}`);
            });
            setTimeout(() => {
                resolve(this._proxyProc);
            }, 200);
        });
    }
}
exports.Adapter = Adapter;
