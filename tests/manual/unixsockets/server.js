"use strict";

const http = require('http');
const path = './server.sock';

const server = http.createServer(function(req, res) {
	console.log('Request for ' + req.url);
	res.statusCode = 200;
	res.setHeader('Content-Type', 'text/plain');
	res.end('Hello World\n');
});

server.listen(path, function() {
	console.log(`Server running at ${path}`);
});
