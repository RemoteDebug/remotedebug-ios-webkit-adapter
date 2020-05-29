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
const request = require("request");
const path = require("path");
const fs = require("fs");
const os = require("os");
const which = require("which");
const logger_1 = require("../logger");
const adapter_1 = require("./adapter");
const adapterCollection_1 = require("./adapterCollection");
const ios8_1 = require("../protocols/ios/ios8");
const ios9_1 = require("../protocols/ios/ios9");
const ios12_1 = require("../protocols/ios/ios12");
class IOSAdapter extends adapterCollection_1.AdapterCollection {
    constructor(id, socket, proxySettings) {
        super(id, socket, {
            port: proxySettings.proxyPort,
            proxyExePath: proxySettings.proxyPath,
            proxyExeArgs: proxySettings.proxyArgs
        });
        this._proxySettings = proxySettings;
        this._protocolMap = new Map();
    }
    getTargets() {
        logger_1.debug(`iOSAdapter.getTargets`);
        return new Promise((resolve) => {
            request(this._url, (error, response, body) => {
                if (error) {
                    resolve([]);
                    return;
                }
                const devices = JSON.parse(body);
                resolve(devices);
            });
        }).then((devices) => {
            devices.forEach(d => {
                if (d.deviceId === 'SIMULATOR') {
                    d.version = '9.3.0'; // TODO: Find a way to auto detect version. Currently hardcoding it.
                }
                else if (d.deviceOSVersion) {
                    d.version = d.deviceOSVersion;
                }
                else {
                    logger_1.debug(`error.iosAdapter.getTargets.getDeviceVersion.failed.fallback, device=${d}. Please update ios-webkit-debug-proxy to version 1.8.5`);
                    d.version = '9.3.0';
                }
            });
            return Promise.resolve(devices);
        }).then((devices) => {
            // Now start up all the adapters
            devices.forEach(d => {
                const adapterId = `${this._id}_${d.deviceId}`;
                if (!this._adapters.has(adapterId)) {
                    const parts = d.url.split(':');
                    if (parts.length > 1) {
                        // Get the port that the ios proxy exe is forwarding for this device
                        const port = parseInt(parts[1], 10);
                        // Create a new adapter for this device and add it to our list
                        const adapter = new adapter_1.Adapter(adapterId, this._proxyUrl, { port: port });
                        adapter.start();
                        adapter.on('socketClosed', (id) => {
                            this.emit('socketClosed', id);
                        });
                        this._adapters.set(adapterId, adapter);
                    }
                }
            });
            return Promise.resolve(devices);
        }).then((devices) => {
            // Now get the targets for each device adapter in our list
            return super.getTargets(devices);
        });
    }
    connectTo(url, wsFrom) {
        const target = super.connectTo(url, wsFrom);
        if (!target) {
            throw new Error(`Target not found for ${url}`);
        }
        if (!this._protocolMap.has(target)) {
            const version = target.data.metadata.version;
            const protocol = this.getProtocolFor(version, target);
            this._protocolMap.set(target, protocol);
        }
        return target;
    }
    static getProxySettings(args) {
        return __awaiter(this, void 0, void 0, function* () {
            logger_1.debug(`iOSAdapter.getProxySettings`);
            let settings = null;
            // Check that the proxy exists
            const proxyPath = yield IOSAdapter.getProxyPath();
            // Start with remote debugging enabled
            // Use default parameters for the ios_webkit_debug_proxy executable
            const proxyPort = args.proxyPort;
            const proxyArgs = [
                '--no-frontend',
                '--config=null:' + proxyPort + ',:' + (proxyPort + 1) + '-' + (proxyPort + 101)
            ];
            settings = {
                proxyPath: proxyPath,
                proxyPort: proxyPort,
                proxyArgs: proxyArgs
            };
            return settings;
        });
    }
    static getProxyPath() {
        logger_1.debug(`iOSAdapter.getProxyPath`);
        return new Promise((resolve, reject) => {
            if (os.platform() === 'win32') {
                const proxy = process.env.SCOOP ?
                    path.resolve(__dirname, process.env.SCOOP + '/apps/ios-webkit-debug-proxy/current/ios_webkit_debug_proxy.exe') :
                    path.resolve(__dirname, process.env.USERPROFILE + '/scoop/apps/ios-webkit-debug-proxy/current/ios_webkit_debug_proxy.exe');
                try {
                    fs.statSync(proxy);
                    resolve(proxy);
                }
                catch (err) {
                    let message = `ios_webkit_debug_proxy.exe not found. Please install 'scoop install ios-webkit-debug-proxy'`;
                    reject(message);
                }
            }
            else if (os.platform() === 'darwin' || os.platform() === 'linux') {
                which('ios_webkit_debug_proxy', function (err, resolvedPath) {
                    if (err) {
                        reject('ios_webkit_debug_proxy not found. Please install ios_webkit_debug_proxy (https://github.com/google/ios-webkit-debug-proxy)');
                    }
                    else {
                        resolve(resolvedPath);
                    }
                });
            }
        });
    }
    getProtocolFor(version, target) {
        logger_1.debug(`iOSAdapter.getProtocolFor`);
        const parts = version.split('.');
        if (parts.length > 0) {
            const major = parseInt(parts[0], 10);
            if (major <= 8) {
                return new ios8_1.IOS8Protocol(target);
            }
            const minor = parseInt(parts[1], 10);
            if (major > 12 || major >= 12 && minor >= 2) {
                return new ios12_1.IOS12Protocol(target);
            }
        }
        return new ios9_1.IOS9Protocol(target);
    }
}
exports.IOSAdapter = IOSAdapter;
