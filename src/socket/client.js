"use strict";

var _Q = require('q');
var http = require('http');
var debug = require('nor-debug');

module.exports = function(path) {
	return function(command, args) {
		return _Q.fcall(function() {
			debug.assert(command).is('string');
			args = args || {};

			var postData = JSON.stringify({"content":args});
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
				res.setEncoding('utf8');
				res.on('data', function(chunk) {
					data += chunk;
				});
				res.on('end', function() {
					var body;
					try {
						body = JSON.parse(data);
						if(res.statusCode === 200) {
							defer.resolve(body.content);
						} else {
							defer.reject(body);
						}
					} catch(e) {
						defer.reject(e);
						return;
					}
				});
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
