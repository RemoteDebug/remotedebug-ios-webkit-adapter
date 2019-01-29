#!/usr/bin/env node

import { ProxyServer } from './server';
import * as optimist from 'optimist';
import { IIOSProxySettings, IIOSDeviceTarget } from './adapters/adapterInterfaces';
var info = require('../package.json');

process.title = 'remotedebug-ios-webkit-adapter';

let argv = optimist
  // .usage('Usage: $0 -p [num]')
  // .alias('p', 'port').describe('p', 'the adapter listerning post').default('p', 9000)
  .describe('version', 'prints current version').boolean('boolean')
  .demand(['adapterPort', 'proxyPort', 'proxyPath', 'deviceId', 'deviceName', 'deviceVersion'])
  .string(['deviceId', 'deviceName', 'deviceVersion'])
  .argv;

if (argv.version) {
  console.error(info.version);
  process.exit(0);
}

if (argv.help) {
  console.log(optimist.help());
  process.exit(0);
}

const proxyPort: number = argv.proxyPort;
const deviceId = argv.deviceId;
const proxySettings = {
    proxyPath: argv.proxyPath,
    proxyPort: proxyPort,
    proxyArgs: [
        '--no-frontend',
        `--config=${deviceId}:${proxyPort}`
    ]
};

const deviceTarget = {
  deviceId: deviceId,
  deviceName: argv.deviceName,
  url: `localhost:${proxyPort}`,
  version: argv.deviceVersion,
};
const server = new ProxyServer();

server.run(argv.adapterPort, <IIOSProxySettings> proxySettings, <IIOSDeviceTarget> deviceTarget).then(port => {
  console.log(`remotedebug-ios-webkit-adapter is listening on port ${port}`);
}).catch(err => {
  console.error('remotedebug-ios-webkit-adapter failed to run with the following error:', err)
  process.exit();
})

process.on('SIGINT', function () {
  server.stop();
  process.exit();
});

process.on('SIGTERM', function () {
  server.stop();
  process.exit();
});
