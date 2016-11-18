#!/usr/bin/env node

import { ProxyServer } from './server';
var optimist = require('optimist');

process.title = 'remotedebug-ios-webkit-adapter'

var argv = optimist
  .usage('Usage: [options]')
  .alias('p', 'port').describe('p', 'the adapter listerning post').default('p', 9000)
  .describe('version', 'prints current version').boolean('boolean')
  .argv

if (argv.version) {
  console.error(require('./package').version);
  process.exit(0);
}

const server = new ProxyServer();
const port = server.run(argv.port);

console.log(`remotedebug-ios-webkit-adapter is listening on port ${port}`);

process.on('SIGINT', function () {
  server.stop();
  process.exit();
})




