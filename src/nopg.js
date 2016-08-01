#!/usr/bin/env node
"use strict";

var _Q = require('q');
var debug = require('nor-debug');
var ARRAY = require('nor-array');
var norUtils = require('./norUtils.js');
var PATH = require('path');
var is = require('nor-is');
var common = require('./socket/common.js');
var uds_client = require('./socket/client.js');

/** */
function usage() {
	process.stderr.write('USAGE: nopg COMMAND [ARG(s)] [OPT(s)]\n');
	process.exit(1);
}

/** Parse args */
function parse_argv(argv) {

	var pids = [];
	var _ = [];
	var verbose = false;
	var where;
	var set;
	var pg = process.env.PGCONFIG;
	var traits;

	Object.keys(argv).forEach(function(key) {

		if(key === '_') {
			pids = pids.concat(argv._.filter(function(arg) {
				return is.integer(arg);
			}));
			_ = _.concat(argv._.filter(function(arg) {
				return !is.integer(arg);
			}));
			return;
		}

		if(key.substr(0, 'where-'.length) === 'where-') {
			if(!where) { where = {}; }
			where[key.substr('where-'.length)] = argv[key];
			return;
		}

		if(key.substr(0, 'set-'.length) === 'set-') {
			if(!set) { set = {}; }
			set[key.substr('set-'.length)] = argv[key];
			return;
		}

		if(key.substr(0, 'traits-'.length) === 'traits-') {
			if(!traits) { traits = {}; }
			traits[key.substr('traits-'.length)] = argv[key];
			return;
		}

		if( (key === 'pg') || (key === 'pgconfig') ) {
			pg = argv.pg;
			return;
		}

		if((key === 'v') || (key === 'verbose')) {
			if(argv[key]) {
				verbose = true;
			}
			return;
		}

		throw new TypeError("Unknown argument: " + key);
	});

	return {
		"pids": pids,
		"_": _,
		"where": where,
		"set": set,
		"traits": traits,
		"pg": pg,
		"verbose": verbose
	};
}

/** Start server in Unix Domain Socket
 * @returns {number} The pid of the started server
 */
function start_uds() {
	return _Q.fcall(function() {
		var spawn = require('child_process').spawn;
		var child = spawn(process.argv[0], [PATH.join(__dirname, 'uds-httpd.js')], {
			detached: true,
			stdio: ['ignore', 'ignore', 'ignore', 'ipc']
		});
		var pid = child.pid;
		var resolved = false;
		var defer = _Q.defer();
		child.once('exit', function() {
			if(resolved) { return; }
			resolved = true;
			defer.reject("unexpected UDS exit");
		});
		child.once('disconnect', function() {
			if(resolved) { return; }
			resolved = true;
			child.unref();
			defer.resolve(pid);
		});
		return defer.promise;
	});
}

// 
var command;
var argv = require('minimist')(process.argv.slice(2), {
	'boolean': ['v', 'verbose'],
	'string': ['pg', 'pgconfig']
});
var args = parse_argv(argv);
if(args.verbose) {
	debug.log("argv = ", argv);
	debug.log("args = ", args);
}
_Q.fcall(function() {

	command = args._.shift();
	if(!command) { return usage(); }
	if(args.verbose) {
		debug.log('command = ', command);
	}

	return _Q.fcall(function() {
		var pid = args.pids.shift();
		if(!pid) {
			return start_uds();
		}
		return pid;
	}).then(function(pid) {

		var uds_path = common.getUDSPath(pid);
		var client = uds_client(uds_path);
		return client(command, args);

	});

}).then(function(results) {

	function get_keys(data) {

		if(is.array(data)) {
			var keys = [];
			ARRAY(data).forEach(function(obj) {
				var paths = norUtils.getPathsFromData(obj);
				ARRAY(paths).map(function(path) {
					return path.join('.');
				}).forEach(function(key) {
					if(keys.indexOf(key) >= 0) {
						return;
					}
					keys.push(key);
				});
			});
			return keys;
		}

		if(is.obj(data)) {
			var paths = norUtils.getPathsFromData(data);
			return paths.map(function(path) { return path.join('.'); });
		}

		throw new TypeError("data was wrong type: " + typeof data);

	}

	function display_keys(keys) {
		console.log( ARRAY(keys).map(function(key) {
			return ''+key;
		}).join('\t') );
	}

	function display_data(keys, obj) {
		var result = {};
		var paths = norUtils.getPathsFromData(obj);
		ARRAY(paths).forEach(function(path) {
			var key = path.join('.');
			var value = norUtils.getDataFromPath(obj, path);
			result[key] = value;
		});

		console.log( ARRAY(keys).map(function(key) {
			return ''+result[key];
		}).join('\t') );
	}

	if(results === undefined) {
		return;
	}

	var keys;

	if(is.array(results)) {
		keys = get_keys(results);
		display_keys(keys);
		ARRAY(results).forEach(display_data.bind(undefined, keys));
		return;
	}

	if(is.object(results)) {
		keys = get_keys(results);
		display_keys(keys);
		display_data(keys, results);
		return;
	}

	console.dir(results);

}).fail(function(err) {
	if(args.verbose) {
		debug.error(err);
	} else {
		var msg = ''+ (err && err.message) || (''+err);
		if(msg === '[object Object]') {
			msg = JSON.stringify(err, null, 2);
		}
		process.stderr.write('Error: ' + msg + '\n');
	}
	process.exit(1);
}).done();
