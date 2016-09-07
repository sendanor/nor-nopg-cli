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
		'USAGE: nopgwait [-qh] [-e <event>] [-t <seconds>] [UUID(s)] [...]\n'+
		'\n'
		'  -h  --help      -- Usage information\n'
		'      --version   -- Version information\n'
		'      --verbose   -- Output more information\n'
		'  -m  --monitor   -- Monitor. Will continue listening events. Normally stops after first event happens.\n'
		'  -q  --quiet     -- Quiet output\n'
		'  -e <event>      -- Listen these events\n'
		'  -t <seconds>    -- Timeout until stop listening\n'
		'\n'
		'This program will output rows when specified events happen. The format will be UUID EVENT_NAME(S).'
		'\n'
		'You can also use one of these ENVs:\n'+
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

/** Parse args */
function parse_argv(argv, type_obj) {

	if(argv.help) {
		usage();
	}

	if(argv.version) {
		version(argv);
	}

	var _ = [];
	var ids = [];
	var verbose = false;
	var quiet = false;
	var monitor = false;
	var timeout = process.env.NOPG_TIMEOUT || undefined;
	var pg = process.env.PGCONFIG;

	Object.keys(argv).forEach(function(key) {

		if(key === '_') {
			ids = ids.concat(argv._.filter(function(arg) {
				return is.uuid(arg);
			}));
			_ = _.concat(argv._.filter(function(arg) {
				return !is.uuid(arg);
			}));
			return;
		}

		if( (key === 'pg') || (key === 'pgconfig') ) {
			pg = argv.pg || argv.pgconfig;
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

		if((key === 'm') || (key === 'monitor')) {
			if(argv[key]) {
				monitor = true;
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

	return {
		"ids": ids,
		"_": _,
		"pg": pg,
		"verbose": verbose,
		"timeout": timeout,
		"quiet": quiet,
		"monitor": monitor
	};
}

// 
var command;
var minimist_opts = {
	'boolean': ['q', 'quiet', 'v', 'verbose', 'm', 'monitor', 'no-timeout', 'help', 'version'],
	'string': ['pg', 'pgconfig']
};
var argv = require('nor-minimist')(process.argv.slice(2), minimist_opts);
var args = parse_argv(argv);

_Q.fcall(function() {



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
