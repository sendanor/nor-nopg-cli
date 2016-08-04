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
	process.stderr.write(
		'USAGE: nopg COMMAND [ARG(s)] [OPT(s)]\n'+
		' where COMMAND is one of:\n'+
		'   start            -- Start backend and create transaction\n'+
		'   TR commit        -- Commit transaction, close backend\n'+
		'   TR rollback      -- Rollback transaction, close backend\n'+
		'   TR exit          -- Close backend\n'+
		'   TR types         -- Search types\n'+
		'   TR type [TYPE]   -- Get type\n'+
		'   TR search [TYPE] -- Search document(s)\n'+
		'   TR delete [TYPE] -- Delete document(s)\n'+
		'   TR update [TYPE] -- Update document(s)\n'+
		'   TR create [TYPE] -- Create document(s)\n'+
		' where TR is PID of daemon handling the transaction\n'+
		' where ARG(s) are one of:\n'+
		'   TYPE                   -- Document type name\n'+
		' where OPT(s) are one of:\n'+
		'   --where-KEY=VALUE      -- Search by these values (for types, search, update, delete)\n'+
		'   --set-KEY=VALUE        -- Set new values (for update, create)\n'+
		'   --traits-KEY=VALUE     -- Set additional options for operations\n'+
		'   --traits-fields=FIELDS -- Fields in result as comma seperated list\n'+
		'   --traits-limit=NUM     -- Limit results by NUM rows\n'+
		'   --traits-offset=NUM    -- Offset results by NUM rows\n'+
		'   --verbose  -v          -- Set verbose mode\n'+
		'   --quiet    -q          -- Set quiet mode, no headers\n'+
		'   --batch    -b          -- Set batch mode, no human readable tables\n'+
		'   --pgconfig=CONFIG      -- Set Postgresql settings\n'+
		'   --pg=CONFIG            -- Set Postgresql settings\n'+
		'\n'
	);
	process.exit(1);
}

/** Parse args */
function parse_argv(argv) {

	var pids = [];
	var _ = [];
	var verbose = false;
	var quiet = false;
	var batch = false;
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

		if((key === 'q') || (key === 'quiet')) {
			if(argv[key]) {
				quiet = true;
			}
			return;
		}

		if((key === 'b') || (key === 'batch')) {
			if(argv[key]) {
				batch = true;
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
		"verbose": verbose,
		"quiet": quiet,
		"batch": batch
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
var minimist_opts = {
	'boolean': ['q', 'quiet', 'v', 'verbose', 'b', 'batch'],
	'string': ['pg', 'pgconfig']
};
var argv = require('minimist')(process.argv.slice(2), minimist_opts);
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

	function get_keys(keys) {
		return ARRAY(keys).map(function(key) {
			return ''+key;
		}).valueOf();
	}

	function display_keys(keys) {
		console.log( get_keys(keys).join('\t') );
	}

	function get_data(keys, obj) {
		var result = {};
		var paths = norUtils.getPathsFromData(obj);
		ARRAY(paths).forEach(function(path) {
			var key = path.join('.');
			var value = norUtils.getDataFromPath(obj, path);
			result[key] = value;
		});

		return ARRAY(keys).map(function(key) {
			return ''+result[key];
		}).valueOf();
	}

	function display_data(keys, obj) {
		console.log( get_data(keys, obj).join('\t') );
	}

	function display_batch(results) {
		var keys;
		if(is.array(results)) {
			keys = norUtils.getKeys(results);
			if(!args.quiet) {
				display_keys(keys);
			}
			ARRAY(results).forEach(display_data.bind(undefined, keys));
			return;
		}

		if(is.object(results)) {
			keys = norUtils.getKeys(results);
			if(!args.quiet) {
				display_keys(keys);
			}
			display_data(keys, results);
			return;
		}

		console.dir(results);

	}

	function display_table(results) {
		var Table = require('cli-table');
		var keys, table;

		var chars = {
			'top': '-',
			'top-mid': '+',
			'top-left': '+',
			'top-right': '+',
			'bottom': '-',
			'bottom-mid': '+',
			'bottom-left': '+',
			'bottom-right': '+',
			'left': '|',
			'left-mid': '+',
			'mid': '-',
			'mid-mid': '+',
			'right': '|',
			'right-mid': '+',
			'middle': '|'
		};

		if(is.array(results)) {
			keys = norUtils.getKeys(results);
			keys = get_keys(keys);
			debug.assert(keys).is('array');
			//debug.log('keys = ', keys);

			// instantiate
			table = new Table({
				head: keys,
				'chars': chars
			});

			// table is an Array, so you can `push`, `unshift`, `splice` and friends
			ARRAY(results).forEach(function(result) {
				var values = get_data(keys, result);
				//debug.log('values = ', values);
				debug.assert(values).is('array');
				table.push(values);
			});

			console.log(table.toString());
			return;
		}

		if(is.object(results)) {
			keys = norUtils.getKeys(results);
			keys = get_keys(keys);
			debug.assert(keys).is('array');
			//debug.log('keys = ', keys);
			var values = get_data(keys, results);
			//debug.log('values = ', values);
			debug.assert(values).is('array');
			table = new Table({
				'chars': chars
			});

			ARRAY(keys).forEach(function(key, index) {
				var value = ''+values[index];
				var tmp = {};
				tmp[key] = value;
				table.push(tmp);
			});

			console.log(table.toString());
			return;
		}

		// Other? Fallback to batch mode
		display_batch(results);
	}

	if(results === undefined) {
		if(args.verbose) {
			debug.log('results was undefined');
		}
		return;
	}

	if(args.batch) {
		display_batch(results);
	} else {
		display_table(results);
	}

}).fail(function(err) {
	if(args.verbose) {
		debug.error(err);
	} else {
		var msg = ''+ ((err && err.message || '') || (''+err));
		if(msg === '[object Object]') {
			msg = JSON.stringify(err, null, 2);
		}
		process.stderr.write('Error: ' + msg + '\n');
	}
	process.exit(1);
}).done();
