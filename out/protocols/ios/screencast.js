"use strict";
//
// Copyright (C) Microsoft. All rights reserved.
//
Object.defineProperty(exports, "__esModule", { value: true });
class ScreencastSession {
    constructor(target, format, quality, maxWidth, maxHeight) {
        this._frameInterval = 250; // 60 fps is 16ms
        this._target = target;
        this._format = format || 'jpg';
        this._quality = quality || 100;
        this._maxHeight = maxHeight || 1024;
        this._maxWidth = maxWidth || 1024;
    }
    dispose() {
        this.stop();
    }
    start() {
        this._framesAcked = new Array();
        this._frameId = 1; // CDT seems to be 1 based and won't ack when 0
        this._target.callTarget('Runtime.evaluate', {
            expression: '(window.innerWidth > 0 ? window.innerWidth : screen.width) + "," + (window.innerHeight > 0 ? window.innerHeight : screen.height) + "," + window.devicePixelRatio'
        }).then((msg) => {
            const parts = msg.result.value.split(',');
            this._deviceWidth = parseInt(parts[0], 10);
            this._deviceHeight = parseInt(parts[1], 10);
            this._pageScaleFactor = parseInt(parts[2], 10);
            this._timerCookie = setInterval(() => this.recordingLoop(), this._frameInterval);
        });
    }
    stop() {
        clearInterval(this._timerCookie);
    }
    ackFrame(frameNumber) {
        this._framesAcked[frameNumber] = true;
    }
    recordingLoop() {
        const currentFrame = this._frameId;
        if (currentFrame > 1 && !this._framesAcked[currentFrame - 1]) {
            return;
        }
        this._frameId++;
        this._target.callTarget('Runtime.evaluate', { expression: 'window.document.body.offsetTop + "," + window.pageXOffset + "," + window.pageYOffset' }).then((msg) => {
            if (msg.wasThrown) {
                return Promise.reject('');
            }
            const parts = msg.result.value.split(',');
            this._offsetTop = parseInt(parts[0], 10);
            this._scrollOffsetX = parseInt(parts[1], 10);
            this._scrollOffsetY = parseInt(parts[2], 10);
            return Promise.resolve();
        }).then(() => {
            this._target.callTarget('Page.snapshotRect', { x: 0, y: 0, width: this._deviceWidth, height: this._deviceHeight, coordinateSystem: 'Viewport' }).then((msg) => {
                const index = msg.dataURL.indexOf('base64,');
                const frame = {
                    data: msg.dataURL.substr(index + 7),
                    metadata: {
                        pageScaleFactor: this._pageScaleFactor,
                        offsetTop: this._offsetTop,
                        deviceWidth: this._deviceWidth,
                        deviceHeight: this._deviceHeight,
                        scrollOffsetX: this._scrollOffsetX,
                        scrollOffsetY: this._scrollOffsetY,
                        timestamp: new Date()
                    },
                    sessionId: currentFrame
                };
                this._target.fireEventToTools('Page.screencastFrame', frame);
            });
        }, () => {
            // Do nothing
        });
    }
}
exports.ScreencastSession = ScreencastSession;
