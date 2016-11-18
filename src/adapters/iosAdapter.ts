//
// Copyright (C) Microsoft. All rights reserved.
//

import * as request from 'request';
import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as WebSocket from 'ws';
import { execFile } from 'child_process';
import { Logger } from '../logger';
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

        Logger.log(this._url)

        this._proxySettings = proxySettings;
        this._protocolMap = new Map<Target, IOSProtocol>();
    }

    public getTargets(): Promise<ITarget[]> {

        Logger.log('iosAdapter.getTargets')
        Logger.log(this._url)

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
                    });
                }

                deviceVersions.push(getter);
            });
            return Promise.all(deviceVersions);
        }).then((devices: IIOSDeviceTarget[]) => {
            // Now start up all the adapters
            devices.forEach(d => {
                const adapterId = d.deviceId;

                if (!this._adapters.has(adapterId)) {
                    const parts = d.url.split(':');
                    if (parts.length > 1) {
                        // Get the port that the ios proxy exe is forwarding for this device
                        const port = parseInt(parts[1], 10);

                        // Create a new adapter for this device and add it to our list
                        const adapter = new Adapter(`${this._id}/${adapterId}`, this._proxyUrl, { port: port });
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
        if (!this._protocolMap.has(target)) {
            const version = (target.data.metadata as IIOSDeviceTarget).version;
            const protocol = this.getProtocolFor(version, target);
            this._protocolMap.set(target, protocol);
        }
        return target;
    }

    public static getProxySettings(args: any): IIOSProxySettings | string {
        let settings: IIOSProxySettings = null;
        let errorMessage: string = null;

        // Check that the proxy exists
        const proxyPath = args.proxyExecutable || IOSAdapter.getProxyPath();
        if (!proxyPath) {
            if (os.platform() !== 'win32') {
                errorMessage = `No iOS proxy was found. Install an iOS proxy (https://github.com/google/ios-webkit-debug-proxy) and specify a valid 'proxyExecutable' path`;
            } else {
                errorMessage = `No iOS proxy was found. Run 'npm install -g vs-libimobile' and specify a valid 'proxyExecutable' path`;
            }
        } else {
            // Grab the specified device name, or default to * (which means first)
            const optionalDeviceName = args.deviceName || '*';

            // Start with remote debugging enabled
            const proxyPort = args.proxyPort;
            const proxyArgs = [];

            // Use default parameters for the ios_webkit_debug_proxy executable
            if (!args.proxyExecutable) {
                proxyArgs.push('--no-frontend');

                // Set the ports available for devices
                proxyArgs.push('--config=null:' + proxyPort + ',:' + (proxyPort + 1) + '-' + (proxyPort + 101));
            }

            if (args.proxyArgs) {
                // Add additional parameters
                proxyArgs.push(...args.proxyArgs);
            }

            settings = {
                proxyPath: proxyPath,
                optionalDeviceName: optionalDeviceName,
                proxyPort: proxyPort,
                proxyArgs: proxyArgs,
                originalArgs: args
            };
        }

        return errorMessage || settings;
    }

    private static getProxyPath(): string {
        if (os.platform() === 'win32') {
            const proxy = path.resolve(__dirname, '../../../../node_modules/vs-libimobile/lib/ios_webkit_debug_proxy.exe');

            try {
                fs.statSync(proxy);
                return proxy;
            } catch (e) {
                // Doesn't exist
            }

        } else if (os.platform() === 'darwin') {
            return '/usr/local/bin/ios_webkit_debug_proxy';
        }

        return null;
    }

    private static getDeviceInfoPath(): string {

        if (os.platform() === 'win32') {
            const proxy = path.resolve(__dirname, '../../../../node_modules/vs-libimobile/lib/ideviceinfo.exe');

            try {
                fs.statSync(proxy);
                return proxy;
            } catch (e) {
                // Doesn't exist
            }

        } else if (os.platform() === 'darwin') {
            return '/usr/local/bin/ideviceinfo';
        }

        return null;
    }

    private getDeviceVersion(uuid: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const _iDeviceInfoPath = IOSAdapter.getDeviceInfoPath();
            execFile(_iDeviceInfoPath, ['-u', `${uuid}`, '-k', 'ProductVersion'], (err, stdout, stderr) => {
                let deviceVersion = '';
                if (!err) {
                    deviceVersion = stdout.trim();
                }
                resolve(deviceVersion);
            });
        });
    }

    private getProtocolFor(version: string, target: Target): IOSProtocol {
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
