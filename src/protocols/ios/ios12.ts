import { IOS9Protocol } from './ios9';
import { Target } from '../target';

export class IOS12Protocol extends IOS9Protocol {

    constructor(target: Target) {
        super(target);
        target.targetBased = true;

        target.addMessageFilter('target::Target.targetCreated', (msg) => this.onTargetCreated(msg));
    }

    private onTargetCreated(msg: any): Promise<any> {
        this._target.targetId = msg.params.targetInfo.targetId;

        return Promise.resolve(msg);
    }
}
