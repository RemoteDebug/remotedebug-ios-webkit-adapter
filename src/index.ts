//
// Copyright (C) Microsoft. All rights reserved.
//

import { ProxyServer } from './server';

const server = new ProxyServer();
const port = server.run(9000);

console.log(`Proxy server listening on port ${port}`);
