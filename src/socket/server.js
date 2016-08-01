"use strict";

/** HTTP server in UNIX socket */

var debug = require('nor-debug');
var http = require('http');
var _Q = require('q');

/** Parse HTTP input body */
function parse_body(req, res) {
	return _Q.fcall(function() {
		var defer = _Q.defer();

		/*
		var bodyParser = require('body-parser');
		bodyParser.json()(req, null, function(err) {
			if(err) {
				debug.log('err = ', err);
				defer.reject(err);
				return;
			}
			debug.log('req.body = ', req.body);
			defer.resolve(req.body);
		});
		*/

		req.setEncoding('utf8');
		var body = '';
		if(req.method !== 'POST') {
			return body;
		}
		req.on('data', function (data) {
			body += data;
			if (body.length > 1e6) {
				req.connection.destroy();
			}
		});
		req.on('end', function () {
			var reply;
			try {
				reply = JSON.parse(body);
				defer.resolve(reply.content);
			} catch(e) {
				defer.reject(e);
			}
		});

		return defer.promise;
	});
}

/** Start a server on UNIX socket
 * @param path {string} The path to UNIX socket
 * @param handlers {object} Object which has all the commands as property
 */
function start_server(path, handlers) {
	debug.assert(handlers).is('object');
	var server = http.createServer(function(req, res) {
		_Q.fcall(function() {
			var command = req.url.split('/')[1];
			if(!handlers.hasOwnProperty(command)) {
				throw new TypeError('no command');
			}
			return parse_body(req).then(function(body) {
				return handlers[command](body);
			});
		}).then(function(body) {
			//console.log('Request for ' + req.url);
			res.statusCode = 200;
			res.setHeader('Content-Type', 'application/json');
			res.end(JSON.stringify({'content':body}));
		}).fail(function(err) {
			debug.error('Failed for ' + req.url, err);
			res.statusCode = 500;
			res.setHeader('Content-Type', 'application/json');
			res.end(JSON.stringify({'title':''+err, 'content':err, 'stack':err.stack}));
		}).done();
	});
	server.listen(path, function() {
		if(process.disconnect) {
			process.disconnect();
		}
	});
	return server;
}

// Exports
module.exports = start_server;
