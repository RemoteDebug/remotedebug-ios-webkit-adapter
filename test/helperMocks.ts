//
// Copyright (C) Microsoft. All rights reserved.
//

import { EventEmitter } from 'events';

export class ProxyServerMock {
}

export class LoggerMock {
    public log(msg: string): void {};
    public error(msg: string): void {};
}
