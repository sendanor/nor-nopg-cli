#!/usr/bin/env node
"use strict";

var _Q = require('q');
var debug = require('nor-debug');
var merge = require('merge');
var ARRAY = require('nor-array');
var norUtils = require('./norUtils.js');
var PATH = require('path');
var is = require('nor-is');
var common = require('./socket/common.js');
var uds_client = require('./socket/client.js');

/** {array} of commands which have the optional type name */
var commands_with_type = [
	'type',
	'search',
	'delete',
	'update',
	'create'
];

/** */
function version(args) {
	var pjson = require('../package.json');
	process.stdout.write(pjson.name + ' v' + pjson.version + '\n');
	if(args && args.verbose) {
		var nopg_info = require('nor-nopg/package.json');
		process.stdout.write(
			'node.js ' + process.version + '\n' +
			'nor-nopg v' + nopg_info.version + '\n'
		);
	}
	process.exit(0);
}

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
		'   --help                 -- This help\n'+
		'   --version              -- Output version information\n'+
		'   --where-KEY=VALUE      -- Search by these values (for types, search, update, delete)\n'+
		'   --set-KEY=VALUE        -- Set new values (for update, create)\n'+
		'   --traits-KEY=VALUE     -- Set additional options for operations\n'+
		'   --traits-fields=FIELDS -- Fields in result as comma seperated list\n'+
		'   --traits-limit=NUM     -- Limit results by NUM rows\n'+
		'   --traits-offset=NUM    -- Offset results by NUM rows\n'+
		'   --verbose  -v          -- Set verbose mode\n'+
		'   --quiet    -q          -- Set quiet mode, no headers\n'+
		'   --batch    -b          -- Set batch mode, no human readable tables\n'+
		'   --timeout=NUM          -- Set timeout as NUM milliseconds until automatic rollback\n'+
		'   --no-timeout           -- Disable timeout\n'+
		'   --pgconfig=CONFIG      -- Set Postgresql settings\n'+
		'   --pg=CONFIG            -- Set Postgresql settings\n'+
		'   --array-fs=FS          -- Sets the field separator for input arrays, default value ","\n'+
		' you can also use one of these ENVs:\n'+
		'   NOPG_TIMEOUT         -- Default timeout in milliseconds for automatic rollback of transactions. Disable with 0, which is also default.\n'+
		'   PGCONFIG             -- The PostgreSQL configuration, eg. "postgres://user:secret@localhost/dbname".\n'+
		'   HOME                 -- User home directory, where .nopg directory for UNIX sockets is located.\n'+
		'   NEW_RELIC_ENABLED    -- Optional support for NewRelic\n'+
		'   NOPG_EVENT_TIMES     -- If enabled, will output statistics on operations.\n'+
		'   DEBUG_NOPG           -- If enabled, additional debug information will be printed.\n'+
		'   NOPG_TYPE_AWARENESS  -- If enabled, objects will automatically expand other types if necessary information is provided.\n'+
		'   NOR_PG_POOL_SIZE     -- How many connections to maintain in a pool to the server. Defaults to 10.\n'+
		'\n'
	);
	process.exit(1);
}

/** Set property recursively
 * @param obj {object} The object where to set a property
 * @param keys {string|array} Array of property names, or a string.
 * @param value {any} The value which to set the property
 */
function set_property(obj, keys, value) {
	debug.assert(obj).is('object');
	if(is.string(keys)) {
		keys = keys.split('.');
	}
	debug.assert(keys).is('array').minLength(1);
	keys = [].concat(keys);

	if(keys.length === 1) {
		obj[keys.shift()] = value;
		return;
	}

	var key = keys.shift();
	if(!obj.hasOwnProperty(key)) {
		obj[key] = {};
	}
	return set_property(obj[key], keys, value);
}

/** Unflatten object */
function unflatten(obj, type_obj) {
	if(!obj) {
		return obj;
	}
	if(!type_obj) {
		return obj;
	}
	//debug.log('obj = ', obj);
	//debug.log('type_obj = ', type_obj);

	debug.assert(obj).is('object');
	debug.assert(type_obj).is('object');

	var tmp = {};
	ARRAY(Object.keys(obj)).forEach(function(key) {
		var value = obj[key];
		key = key.replace(/\-/g, ".");
		//debug.log('key = ', key);
		set_property(tmp, key, value);
	});
	//debug.log('tmp = ', tmp);
	return tmp;
}

/** Parse args */
function parse_argv(argv, type_obj) {

	if(argv.help) {
		usage();
	}

	if(argv.version) {
		version(argv);
	}

	var pids = [];
	var _ = [];
	var verbose = false;
	var quiet = false;
	var batch = false;
	var timeout = process.env.NOPG_TIMEOUT || undefined;
	var array_fs;
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
			pg = argv.pg || argv.pgconfig;
			return;
		}

		if( key === 'array-fs' ) {
			array_fs = argv['array-fs'];
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

		if(key === 'no-timeout') {
			timeout = undefined;
			return;
		}

		if(key === 'timeout') {
			timeout = argv[key];
			return;
		}

		throw new TypeError("Unknown argument: " + key);
	});

	var command, type;
	if(_.length >= 2) {
		if(commands_with_type.indexOf(_[0]) >= 0) {
			command = _[0];
			type = _[1];
		}
	} else if(_.length === 1) {
		if(commands_with_type.indexOf(_[0]) >= 0) {
			command = _[0];
		}
	}

	return {
		"pids": pids,
		"_": _,
		"where": unflatten(where, type_obj),
		"set": unflatten(set, type_obj),
		"traits": traits,
		"pg": pg,
		"array_fs": array_fs,
		"verbose": verbose,
		"timeout": timeout,
		"quiet": quiet,
		"batch": batch,
		"command": command,
		"type": type
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
	'boolean': ['q', 'quiet', 'v', 'verbose', 'b', 'batch', 'no-timeout', 'help', 'version'],
	'string': ['pg', 'pgconfig', 'array-fs'],
	'default': {
		'array-fs': ','
	}
};
var argv = require('nor-minimist')(process.argv.slice(2), minimist_opts);
var args = parse_argv(argv);
var uds_path;
var client;
_Q.fcall(function() {
	return _Q.fcall(function() {
		var pid = args.pids.shift();
		if(!pid) {
			return start_uds();
		}
		return pid;
	}).then(function(pid) {
		uds_path = common.getUDSPath(pid);
		client = uds_client(uds_path);
	});
}).then(function() {

	if(!args.type) {
		return;
	}

	return client("type", {
		'_': [args.type]
	}).then(function(type_obj) {
		//debug.log("type_obj: ", type_obj);

		var paths = norUtils.getPathsFromType(type_obj);
		var types = ARRAY(paths).map(function(path) {
			var pointer = norUtils.getSchemaPointerFromPath(type_obj, path);
			if(pointer) {
				var schema = pointer.getSchema();
				return (schema && schema.type) || 'string';
			}
		}).valueOf();
		var keys = ARRAY(paths).map(function(path) {
			return path.join('.');
		}).valueOf();

		//debug.log('types = ', types);
		//debug.log('keys = ', keys);

		var boolean_keys = keys.filter(function(key, index) {
			return types[index] === "boolean";
		});

		function argumentize(key) {
			return "" + key.replace(/\./g, "-");
		}

		function prefix_set(key) {
			return "set-" + key;
		}

		function prefix_where(key) {
			return "where-" + key;
		}

		boolean_keys = [].concat(
			boolean_keys.map(argumentize).map(prefix_set)
		).concat(
			boolean_keys.map(argumentize).map(prefix_where)
		).concat(
			boolean_keys.map(prefix_set)
		).concat(
			boolean_keys.map(prefix_where)
		);

		var array_keys = keys.filter(function(key, index) {
			return (types[index] === "array");
		});

		array_keys = [].concat(
			array_keys.map(argumentize).map(prefix_set)
		).concat(
			array_keys.map(argumentize).map(prefix_where)
		).concat(
			array_keys.map(prefix_set)
		).concat(
			array_keys.map(prefix_where)
		);

		var string_keys = keys.filter(function(key, index) {
			return (types[index] === "string") || (types[index] === "array");
		});

		string_keys = [].concat(
			string_keys.map(argumentize).map(prefix_set)
		).concat(
			string_keys.map(argumentize).map(prefix_where)
		).concat(
			string_keys.map(prefix_set)
		).concat(
			string_keys.map(prefix_where)
		);

		var defaults = {};
		//ARRAY(boolean_keys).forEach(function(key) {
		//	defaults[key] = undefined;
		//});

		var opts = JSON.parse(JSON.stringify(minimist_opts));

		opts.boolean = [].concat(opts.boolean).concat(boolean_keys);
		opts.string = [].concat(opts.string).concat(string_keys);
		opts.default = merge({}, opts.default, defaults);

		//debug.log('opts = ', opts);

		argv = require('nor-minimist')(process.argv.slice(2), opts);

		// Parse arrays in arguments
		ARRAY(array_keys).forEach(function(key) {
			if(!argv.hasOwnProperty(key)) {
				return;
			}
			//debug.log('argv['+key+'] = ', argv[key]);
			argv[key] = (''+argv[key]).split(argv.array_fs||',');
		});

		// Parse 
		args = parse_argv(argv, type_obj);

	});

}).then(function() {

	if(args.verbose) {
		debug.log(
			"argv = ", argv, '\n', 
			"args = ", args
		);
	}

	command = args._.shift();
	if(!command) { return usage(); }
	if(args.verbose) {
		debug.log('command = ', command);
	}
	return client(command, args);

}).then(function(results) {

	if(args.verbose) {
		debug.log('results = ', results);
	}

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
