//
// Copyright (C) Microsoft. All rights reserved.
//

import * as request from 'request';
import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as WebSocket from 'ws';
import * as which from 'which';
import { execFile } from 'child-process-promise';
import { Logger, debug } from '../logger';
import { Adapter } from './adapter';
import { Target } from '../protocols/target';
import { AdapterCollection } from './adapterCollection';
import { ITarget, IIOSDeviceTarget, IIOSProxySettings } from './adapterInterfaces';
import { IOSProtocol } from '../protocols/ios/ios';
import { IOS8Protocol } from '../protocols/ios/ios8';
import { IOS9Protocol } from '../protocols/ios/ios9';

export class IOSAdapter extends AdapterCollection {
    private _proxySettings: IIOSProxySettings;
    private _protocolMap: Map<Target, IOSProtocol>;

    constructor(id: string, socket: string, proxySettings: IIOSProxySettings) {
        super(id, socket, {
            port: proxySettings.proxyPort,
            proxyExePath: proxySettings.proxyPath,
            proxyExeArgs: proxySettings.proxyArgs
        });

        this._proxySettings = proxySettings;
        this._protocolMap = new Map<Target, IOSProtocol>();
    }

    public getTargets(): Promise<ITarget[]> {
        debug(`iOSAdapter.getTargets`);

        return new Promise((resolve) => {
            request(this._url, (error: any, response: http.IncomingMessage, body: any) => {
                if (error) {
                    resolve([]);
                    return;
                }

                const devices: IIOSDeviceTarget[] = JSON.parse(body);
                resolve(devices);
            });
        }).then((devices: IIOSDeviceTarget[]) => {
            // Now request the device version for each device found
            const deviceVersions: Promise<IIOSDeviceTarget>[] = [];
            devices.forEach(d => {

                let getter;
                if (d.deviceId === 'SIMULATOR') {
                    d.version = '9.3.0'; // TODO: Find a way to auto detect version. Currently hardcoding it.
                    getter = Promise.resolve(d);
                } else {
                    getter = this.getDeviceVersion(d.deviceId).then(v => {
                        d.version = v;
                        return Promise.resolve(d);
                    }).catch((err) => {
                        // Device version detection failed, using fallback
                        debug(`error.iosAdapter.getTargets.getDeviceVersion.failed.fallback, device=${d}`);
                        d.version = '9.3.0';
                        return Promise.resolve(d);
                    });
                }

                deviceVersions.push(getter);
            });
            return Promise.all(deviceVersions);
        }).then((devices: IIOSDeviceTarget[]) => {
            // Now start up all the adapters
            devices.forEach(d => {
                const adapterId = `${this._id}_${d.deviceId}`;

                if (!this._adapters.has(adapterId)) {
                    const parts = d.url.split(':');
                    if (parts.length > 1) {
                        // Get the port that the ios proxy exe is forwarding for this device
                        const port = parseInt(parts[1], 10);

                        // Create a new adapter for this device and add it to our list
                        const adapter = new Adapter(adapterId, this._proxyUrl, { port: port });
                        adapter.start();
                        adapter.on('socketClosed', (id) => {
                            this.emit('socketClosed', id);
                        });
                        this._adapters.set(adapterId, adapter);
                    }
                }
            });
            return Promise.resolve(devices);
        }).then((devices: IIOSDeviceTarget[]) => {
            // Now get the targets for each device adapter in our list
            return super.getTargets(devices);
        });
    }

    public connectTo(url: string, wsFrom: WebSocket): Target {
        const target = super.connectTo(url, wsFrom);

        if (!target) {
            throw new Error(`Target not found for ${url}`);
        }

        if (!this._protocolMap.has(target)) {
            const version = (target.data.metadata as IIOSDeviceTarget).version;
            const protocol = this.getProtocolFor(version, target);
            this._protocolMap.set(target, protocol);
        }
        return target;
    }

    public static async getProxySettings(args: any): Promise<IIOSProxySettings | string> {
        debug(`iOSAdapter.getProxySettings`);
        let settings: IIOSProxySettings = null;

        // Check that the proxy exists
        const proxyPath = await IOSAdapter.getProxyPath();

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
    }

    private static getProxyPath(): Promise<string> {
        debug(`iOSAdapter.getProxyPath`);
        return new Promise((resolve, reject) => {
            if (os.platform() === 'win32') {
                const proxy = process.env.SCOOP ?
                path.resolve(__dirname, process.env.SCOOP + '/apps/ios-webkit-debug-proxy/current/ios_webkit_debug_proxy.exe') :
                path.resolve(__dirname, process.env.USERPROFILE + '/scoop/apps/ios-webkit-debug-proxy/current/ios_webkit_debug_proxy.exe');
                try {
                    fs.statSync(proxy);
                    resolve(proxy);
                } catch (err) {
                    let message = `ios_webkit_debug_proxy.exe not found. Please install 'scoop install ios-webkit-debug-proxy'`;
                    reject(message);
                }
            } else if (os.platform() === 'darwin' || os.platform() === 'linux') {
                which('ios_webkit_debug_proxy', function (err, resolvedPath) {
                    if (err) {
                        reject('ios_webkit_debug_proxy not found. Please install ios_webkit_debug_proxy (https://github.com/google/ios-webkit-debug-proxy)');
                    } else {
                        resolve(resolvedPath);
                    }
                });
            }
        });
    }

    private static getDeviceInfoPath(): Promise<string> {
        debug(`iOSAdapter.getDeviceInfoPath`);
        return new Promise((resolve, reject) => {
            if (os.platform() === 'win32') {
                const proxy = path.resolve(__dirname, process.env.USERPROFILE + '/AppData/Roaming/npm/node_modules/vs-libimobile/lib/ideviceinfo.exe');
                try {
                    fs.statSync(proxy);
                    resolve(proxy);
                } catch (e) {
                    reject(`ideviceinfo not found. Please install 'npm install -g vs-libimobile'`);
                }

            } else if (os.platform() === 'darwin' || os.platform() === 'linux') {
                which('ideviceinfo', function (err, resolvedPath) {
                    if (err) {
                        reject('ideviceinfo not found. Please install libimobiledevice (https://github.com/libimobiledevice/libimobiledevice)');
                    } else {
                        resolve(resolvedPath);
                    }
                });
            }
        });
    }

    private async getDeviceVersion(uuid: string): Promise<string> {
        debug(`iOSAdapter.getDeviceVersion`);
        const _iDeviceInfoPath = await IOSAdapter.getDeviceInfoPath();
        const proc = await execFile(_iDeviceInfoPath, ['-u', `${uuid}`, '-k', 'ProductVersion']);

        let deviceVersion = '';
        if (!proc.err) {
            deviceVersion = proc.stdout.trim();
        }

        return deviceVersion;
    }

    private getProtocolFor(version: string, target: Target): IOSProtocol {
        debug(`iOSAdapter.getProtocolFor`);
        const parts = version.split('.');
        if (parts.length > 0) {
            const major = parseInt(parts[0], 10);
            if (major <= 8) {
                return new IOS8Protocol(target);
            }
        }

        return new IOS9Protocol(target);
    }
}
