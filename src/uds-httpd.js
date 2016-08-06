"use strict";

var fs = require('nor-fs');
var PATH = require('path');
var pid = process.pid;
var common = require('./socket/common.js');
var create_server = require('./socket/server.js');
var commands = require('./commands.js');
var globals = require('./globals.js');

var socket = common.getUDSPath(pid);

var socket_dir = PATH.dirname(socket);

function noop() {}

process.on('disconnected', noop);

fs.mkdirIfMissing(socket_dir).then(function() {
	var server = globals.server = create_server(socket, commands);

	function cleanup() {
		if(server) {
			server.close();
			server = undefined;
		}
		if(socket) {
			fs.sync.unlinkIfExists(socket);
			socket = undefined;
		}
	}

	process.on('beforeExit', cleanup);
	process.on('exit', cleanup);
	process.on('SIGINT', cleanup);
	process.on('SIGTERM', cleanup);
	server.once('close', cleanup);

	console.log(process.pid);

});
