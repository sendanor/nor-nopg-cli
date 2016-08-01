"use strict";

var PGCONFIG = process.env.PGCONFIG;

var debug = require('nor-debug');
var http = require('http');
var _Q = require('q');
var nopg = require('nor-nopg');

var db;
var handlers = {};

/** Start transaction */
handlers.start = function(args) {
	if(db) { throw new TypeError("transaction started already"); }
	return nopg.start(args.shift()).then(function(db_) {
		db = db_;
	});
};

/** Commit transaction */
handlers.commit = function() {
	if(!db) { throw new TypeError("transaction not started"); }
	return db.commit().then(function() {
		db = undefined;
	});
};

/** Rollback transaction */
handlers.rollback = function() {
	if(!db) { throw new TypeError("transaction not started"); }
	return db.rollback().then(function() {
		db = undefined;
	});
};

/** Search documents */
handlers.search = function(args) {
	if(!db) { throw new TypeError("transaction not started"); }
	var type = args.shift();
	var where = args.shift();
	return db.search(type)(where).then(function(db_) {
		return db.fetch();
	});
};

/** Parse HTTP input body */
function parse_body(req) {
	return _Q.fcall(function() {
		var defer = _Q.defer();
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
				defer.resolve(reply);
			} catch(e) {
				defer.reject(e);
			}
		});
		return defer.promise;
	});
}

/** Start a server on UNIX socket */
function start_server(path) {

	var server = http.createServer(function(req, res) {
		_Q.fcall(function() {
			var command = req.url.split('/')[1];
			if(!handlers.hasOwnProperty(command)) {
				throw new TypeError('no command');
			}
			return parse_body(req).then(function(body) {
				debug.assert(body).is('array');
				return handlers[command](body);
			});
		}).then(function(body) {
			console.log('Request for ' + req.url);
			res.statusCode = 200;
			res.setHeader('Content-Type', 'application/json');
			res.end(JSON.stringify({'content':body}));
		}).fail(function(err) {
			debug.error('Failed for ' + req.url, err);
			res.statusCode = 500;
			res.setHeader('Content-Type', 'application/json');
			res.end(JSON.stringify(err));
		}).done();
	});
	server.listen(path);
	return server;
}

// Exports
module.exports = start_server;
