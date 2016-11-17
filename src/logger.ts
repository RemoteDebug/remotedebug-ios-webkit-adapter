//
// Copyright (C) Microsoft. All rights reserved.
//

class LoggerUtil {

    constructor() {
    }

    public log(msg: string): void {
        console.log.apply(this, Array.prototype.slice.call(arguments))
    }

    public error(msg: string): void {
        console.error(msg);
    }
}

export const Logger = new LoggerUtil();
