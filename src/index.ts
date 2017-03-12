#!/usr/bin/env node

import { ProxyServer } from './server';
import * as optimist from 'optimist';
var info = require('../package.json');

process.title = 'remotedebug-ios-webkit-adapter';

let argv = optimist
  .usage('Usage: $0 -p [num]')
  .alias('p', 'port').describe('p', 'the adapter listerning post').default('p', 9000)
  .describe('version', 'prints current version').boolean('boolean')
  .argv;

if (argv.version) {
  console.error(info.version);
  process.exit(0);
}

if (argv.help) {
  console.log(optimist.help());
  process.exit(0);
}

const server = new ProxyServer();
const port = server.run(argv.port);

console.log(`remotedebug-ios-webkit-adapter is listening on port ${port}`);

process.on('SIGINT', function () {
  server.stop();
  process.exit();
});
