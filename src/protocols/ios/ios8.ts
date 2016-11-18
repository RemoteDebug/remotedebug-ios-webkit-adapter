//
// Copyright (C) Microsoft. All rights reserved.
//

import { IOSProtocol} from './ios';
import { Target } from '../target';
import { Logger } from '../../logger';

export class IOS8Protocol extends IOSProtocol {

    constructor(target: Target) {
        super(target);

        this._target.addMessageFilter('target::error', (msg) => {
            Logger.error('Error received (overriding) ' + JSON.stringify(msg));
            msg = {
                id: msg.id,
                result: {}
            };

            return Promise.resolve(msg);
        });
    }

    protected mapSelectorList (selectorList): void {
        const range = selectorList.range;

        for (let i = 0; i < selectorList.selectors.length; i++) {
            selectorList.selectors[i] = {text: selectorList.selectors[i]};

            if (range !== undefined) {
                selectorList.selectors[i].range = range;
            }
        }

        delete selectorList.range;
    }
}
