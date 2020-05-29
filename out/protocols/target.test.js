"use strict";
//
// Copyright (C) Microsoft. All rights reserved.
//
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const mockery = require("mockery");
const mock_socket_1 = require("mock-socket");
const helperMocks_1 = require("../helperMocks");
// As of 0.1.0, the included .d.ts is not in the right format to use the import syntax here
// https://github.com/florinn/typemoq/issues/4
// const typemoq: ITypeMoqStatic = require('typemoq');
const TypeMoq = require("typemoq");
const MODULE_UNDER_TEST = '../../protocols/target';
function CreateTarget() {
    const target = new ((require(MODULE_UNDER_TEST)).Target)();
    return target;
}
suite('Proxy/Protocol/Target', () => {
    const targetUrl = 'ws://localhost:8080';
    const toolsUrl = 'ws://localhost:9090';
    let loggerMock;
    let targetServer;
    let toolsServer;
    let toolSocket;
    let targetReady;
    let toolsReady;
    function setupTargetAndTools() {
        toolSocket = new mock_socket_1.SocketIO(toolsUrl);
        targetReady = new Promise((resolve, reject) => {
            targetServer.on('connection', server => {
                server.emit('open');
                resolve();
            });
        });
        toolsReady = new Promise((resolve, reject) => {
            toolSocket.on('connect', () => {
                resolve();
            });
        });
    }
    setup(() => {
        mockery.enable({ useCleanCache: true, warnOnReplace: false, warnOnUnregistered: false });
        mockery.registerMock('ws', mock_socket_1.SocketIO);
        // The mock websocket class does not have all the necessary functions to mock.
        // SocketIO has most of them minus the OPEN/CLOSED boolean. We only care about OPEN so lets just add this functionality on here.
        mock_socket_1.SocketIO.OPEN = 1;
        loggerMock = TypeMoq.Mock.ofType(helperMocks_1.LoggerMock, TypeMoq.MockBehavior.Loose);
        mockery.registerMock('../../shell/logger', { Logger: loggerMock.object });
        targetServer = new mock_socket_1.Server(targetUrl);
        toolsServer = new mock_socket_1.Server(toolsUrl);
        toolsServer.on('connection', server => {
            server.emit('open');
        });
    });
    teardown(() => {
        mockery.deregisterAll();
        mockery.disable();
        loggerMock.verifyAll();
        targetServer.stop();
        toolsServer.stop();
    });
    suite('connectTo()', () => {
        test('establishes a connection to the real target websocket', (done) => {
            targetServer.on('connection', server => {
                done();
            });
            const target = CreateTarget();
            target.connectTo(targetUrl, null);
        });
        test('buffers messages to target before connect and then sends them on connect', (done) => {
            const target = CreateTarget();
            const newToolSocket = new mock_socket_1.SocketIO(toolsUrl);
            newToolSocket.on('connect', () => {
                target.connectTo(targetUrl, newToolSocket);
                let messages = ['test', 'test2'];
                let receivedCount = 0;
                messages.forEach((i) => {
                    target.on(`tools::${i}`, () => {
                        receivedCount++;
                        if (receivedCount === messages.length) {
                            done();
                        }
                    });
                    target.forward(JSON.stringify({ method: i }));
                });
                assert.equal(receivedCount, 0, 'tools should not have received a message before connecting');
                // Establish the target connection now
                targetServer.on('connection', server => {
                    server.emit('open');
                });
            });
        });
    });
    suite('forward()', () => {
        setup(() => {
            setupTargetAndTools();
        });
        test('emits message from tools to target', (done) => {
            const target = CreateTarget();
            Promise.all([targetReady, toolsReady]).then(() => {
                let messageEmitted = false;
                target.on('tools::test', () => {
                    messageEmitted = true;
                });
                targetServer.on('message', () => {
                    assert.equal(messageEmitted, true, 'message should have been emitted by the target');
                    done();
                });
                target.forward(JSON.stringify({ method: 'test' }));
            });
            target.connectTo(targetUrl, toolSocket);
        });
        test('emits message from target to tools', (done) => {
            const target = CreateTarget();
            Promise.all([targetReady, toolsReady]).then(() => {
                let messageEmitted = false;
                target.on('target::test', () => {
                    messageEmitted = true;
                });
                toolsServer.on('message', () => {
                    assert.equal(messageEmitted, true, 'message should have been emitted by the target');
                    done();
                });
                targetServer.emit('message', JSON.stringify({ method: 'test' }));
            });
            target.connectTo(targetUrl, toolSocket);
        });
    });
    suite('fireEventToTools()', () => {
        setup(() => {
            setupTargetAndTools();
        });
        test('sends the correct data format', (done) => {
            const target = CreateTarget();
            Promise.all([targetReady, toolsReady]).then(() => {
                const expectedMethod = 'testEventName';
                const expectedParams = { someParam: true, more: { name: 'test', value: 1 } };
                toolsServer.on('message', (msg) => {
                    const data = JSON.parse(msg);
                    assert.equal(data.method, expectedMethod, 'message.method should match what was fired');
                    assert.deepEqual(data.params, expectedParams, 'message.params should match what was fired');
                    done();
                });
                target.fireEventToTools(expectedMethod, expectedParams);
            });
            target.connectTo(targetUrl, toolSocket);
        });
    });
    suite('fireResultToTools()', () => {
        setup(() => {
            setupTargetAndTools();
        });
        test('sends the correct data format', (done) => {
            const target = CreateTarget();
            Promise.all([targetReady, toolsReady]).then(() => {
                const expectedId = 102;
                const expectedResult = { method: 'css.Enable', someParam: true, more: { name: 'test', value: 1 } };
                toolsServer.on('message', (msg) => {
                    const data = JSON.parse(msg);
                    assert.equal(data.id, expectedId, 'message.id should match what was fired');
                    assert.deepEqual(data.result, expectedResult, 'message.result should match what was fired');
                    done();
                });
                target.fireResultToTools(expectedId, expectedResult);
            });
            target.connectTo(targetUrl, toolSocket);
        });
    });
    suite('callTarget()', () => {
        setup(() => {
            setupTargetAndTools();
        });
        test('sends a request to the target without calling back to the tools', (done) => {
            const target = CreateTarget();
            toolsServer.on('message', () => {
                assert.fail('the adapter calling the target should not have sent a message to the tools', '', '', '');
            });
            target.on('target::Debugger.Enable', () => {
                assert.fail('the adapter calling the target should not have emitted an event, it should resolve the promise instead', '', '', '');
            });
            Promise.all([targetReady, toolsReady]).then(() => {
                const expectedMethod = 'Debugger.Enable';
                const expectedParams = { someParam: true, more: { name: 'test', value: 1 } };
                const expectedResponse = { id: 0, result: expectedParams };
                targetServer.on('message', (msg) => {
                    const data = JSON.parse(msg);
                    assert.equal(data.method, expectedMethod, 'message.method should match what was fired');
                    assert.deepEqual(data.params, expectedParams, 'message.params should match what was fired');
                    expectedResponse.id = data.id;
                    targetServer.emit('message', JSON.stringify(expectedResponse));
                });
                target.callTarget(expectedMethod, expectedParams).then((result) => {
                    assert.deepEqual(result, expectedParams, 'result should match what was returned from the target server');
                    done();
                });
            });
            target.connectTo(targetUrl, toolSocket);
        });
        test('rejects the promise on an error from the target', (done) => {
            const target = CreateTarget();
            Promise.all([targetReady, toolsReady]).then(() => {
                const expectedError = { someErrorProperty: 'yes', moreInfo: { test: 1, pokemon: true } };
                const expectedResponse = { id: 0, error: expectedError };
                targetServer.on('message', (msg) => {
                    const data = JSON.parse(msg);
                    expectedResponse.id = data.id;
                    targetServer.emit('message', JSON.stringify(expectedResponse));
                });
                target.callTarget('anything', null).then((result) => {
                    assert.fail('promise should not have succeeded', '', '', '');
                }, (error) => {
                    assert.deepEqual(error, expectedError, 'error should match what was returned from the target server');
                    done();
                });
            });
            target.connectTo(targetUrl, toolSocket);
        });
    });
    suite('addMessageFilter()', () => {
        setup(() => {
            setupTargetAndTools();
        });
        test('filter is called and modified on message from tools', (done) => {
            const target = CreateTarget();
            Promise.all([targetReady, toolsReady]).then(() => {
                const expectedModifiedMessage = { method: 'CSS.EnableModified', params: { someNewParams: true } };
                target.addMessageFilter('tools::CSS.Enable', (msg) => {
                    return Promise.resolve(expectedModifiedMessage);
                });
                targetServer.on('message', (msg) => {
                    const data = JSON.parse(msg);
                    assert.deepEqual(data, expectedModifiedMessage, 'message should have been modified by the filter before it reached the target');
                    done();
                });
                target.forward(JSON.stringify({ method: 'CSS.Enable' }));
            });
            target.connectTo(targetUrl, toolSocket);
        });
        test('filter is called and modified on message from target', (done) => {
            const target = CreateTarget();
            Promise.all([targetReady, toolsReady]).then(() => {
                const expectedModifiedMessage = { method: 'Console.newLog', params: { someNewParams: true } };
                target.addMessageFilter('target::Console.log', (msg) => {
                    return Promise.resolve(expectedModifiedMessage);
                });
                toolsServer.on('message', (msg) => {
                    const data = JSON.parse(msg);
                    assert.deepEqual(data, expectedModifiedMessage, 'message should have been modified by the filter before it reached the target');
                    done();
                });
                targetServer.emit('message', JSON.stringify({ method: 'Console.log' }));
            });
            target.connectTo(targetUrl, toolSocket);
        });
        test('filter is called and modifies the response to a request from tools', (done) => {
            const target = CreateTarget();
            Promise.all([targetReady, toolsReady]).then(() => {
                const expectedResult = { id: 10, result: { sheets: [1, 2, 3] } };
                const expectedModifiedResult = { id: 10, result: { sheets: [1, 2, 3, 5, 6, 7, 8, 345, 534], newParam: true } };
                target.addMessageFilter('target::CSS.setStyleSheets', (msg) => {
                    assert.deepEqual(msg, expectedResult);
                    return Promise.resolve(expectedModifiedResult);
                });
                targetServer.on('message', (msg) => {
                    const data = JSON.parse(msg);
                    expectedResult.id = data.id;
                    targetServer.emit('message', JSON.stringify(expectedResult));
                });
                toolsServer.on('message', (msg) => {
                    const data = JSON.parse(msg);
                    assert.deepEqual(data, expectedModifiedResult, 'result should have been modified by the filter before it was returned back to the tools');
                    done();
                });
                target.forward(JSON.stringify({ id: 101, method: 'CSS.setStyleSheets' }));
            });
            target.connectTo(targetUrl, toolSocket);
        });
    });
    suite('updateClient()', () => {
        setup(() => {
            setupTargetAndTools();
        });
        test('message is sent to new tools', (done) => {
            const target = CreateTarget();
            const updatedToolSocket = new mock_socket_1.SocketIO(toolsUrl);
            const updatedToolsReady = new Promise((resolve, reject) => {
                updatedToolSocket.on('connect', () => {
                    resolve();
                });
            });
            Promise.all([targetReady, toolsReady, updatedToolsReady]).then(() => {
                toolSocket.send = (msg) => {
                    assert.fail('message should have been sent to the new server', '', '', '');
                };
                updatedToolSocket.send = (msg) => {
                    done();
                };
                target.updateClient(updatedToolSocket);
                targetServer.emit('message', JSON.stringify({ method: 'Console.log' }));
            });
            target.connectTo(targetUrl, toolSocket);
        });
    });
    suite('replyWithEmpty()', () => {
        setup(() => {
            setupTargetAndTools();
        });
        test('empty message is sent to tools', (done) => {
            const target = CreateTarget();
            Promise.all([targetReady, toolsReady]).then(() => {
                const expectedId = 101;
                let actualId = 0;
                target.addMessageFilter('tools::DOM.apithatneedsareply', (msg) => {
                    actualId = msg.id;
                    return target.replyWithEmpty(msg);
                });
                toolsServer.on('message', (msg) => {
                    const data = JSON.parse(msg);
                    const expectedEmptyMessage = { id: actualId, result: {} };
                    assert.deepEqual(data, expectedEmptyMessage, 'message should have been an empty result with the correct id');
                    done();
                });
                target.forward(JSON.stringify({ id: expectedId, method: 'DOM.apithatneedsareply' }));
            });
            target.connectTo(targetUrl, toolSocket);
        });
    });
});
