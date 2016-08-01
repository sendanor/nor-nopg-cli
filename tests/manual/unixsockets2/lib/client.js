"use strict";

var _Q = require('q');
var http = require('http');
var debug = require('nor-debug');

module.exports = function(path) {
  return function(command, args) {
	return _Q.fcall(function() {
		debug.assert(command).is('string');
		debug.assert(args).ignore(undefined).is('array');
		args = args || [];

		var postData = JSON.stringify(args);
		var options = {
			socketPath: path,
			path: '/'+command,
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Content-Length': postData.length
			}
		};

		var defer = _Q.defer();

		var data = '';
		var req = http.request(options, function(res) {
			console.log(`STATUS: ${res.statusCode}`);
			console.log(`HEADERS: ${JSON.stringify(res.headers)}`);
			res.setEncoding('utf8');
			res.on('data', function(chunk) {
				data += chunk;
			});
			res.on('end', function() {
				var body;
				try {
					body = JSON.parse(data);
					defer.resolve(body.content);
				} catch(e) {
					defer.reject(e);
					return;
				}
			})
		});

		req.on('error', function(e) {
			defer.reject(e);
		});

		// write data to request body
		req.write(postData);
		req.end();

		return defer.promise;
	});
  };
};

