//
// Copyright (C) Microsoft. All rights reserved.
//

export interface ITarget {
    appId?: string;
    description: string;
    devtoolsFrontendUrl: string;
    faviconUrl: string;
    id: string;
    title: string;
    type: string;
    url: string;
    webSocketDebuggerUrl: string;
    adapterType: string;
    metadata?: IIOSDeviceTarget;
}

export interface IAdapterOptions {
    pollingInterval?: number;
    baseUrl?: string;
    path?: string;
    port?: number;
    proxyExePath?: string;
    proxyExeArgs?: string[];
}

export interface IIOSDeviceTarget {
    deviceId: string;
    deviceName: string;
    deviceOSVersion: string;
    url: string;
    version: string;
}

export interface IIOSProxySettings {
    proxyPath: string;
    proxyPort: number;
    proxyArgs: string[];
}
