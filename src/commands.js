"use strict";

var is = require('nor-is');
var debug = require('nor-debug');
var merge = require('merge');
var nopg = require('nor-nopg');
var ARRAY = require('nor-array');
var _Q = require('q');

/* Disables the default transaction timeout of 30 seconds */
var NOPG_TIMEOUT = process.env.NOPG_TIMEOUT || '0';
nopg.defaults.timeout = parseInt(NOPG_TIMEOUT, 10) || undefined;

var globals = require('./globals.js');

/** Last listener ID */
var last_listener_id = 0;

/** Listeners are saved here */
var listeners = {};

/** Prepare types for publification */
function prepare_type(type) {
	var tmp = JSON.parse(JSON.stringify(type));
	var meta = tmp.$meta;
	delete tmp.$events;
	delete tmp.$meta;
	if(meta) {
		ARRAY(Object.keys(meta)).forEach(function(key) {
			tmp[key] = meta[key];
		});
	}
	return tmp;
}

/** Prepare types for publification */
function prepare_types(types) {
	return ARRAY(types).map(prepare_type).valueOf();
}

/** Prepare document for publification */
function prepare_doc(doc) {
	var tmp = JSON.parse(JSON.stringify(doc));
	var content = tmp.$content;
	delete tmp.$events;
	delete tmp.$content;
	if(content) {
		ARRAY(Object.keys(content)).forEach(function(key) {
			tmp[key] = content[key];
		});
	}

	var childs;
	if(tmp.hasOwnProperty('$documents')) {
		childs = tmp.$documents;
		Object.keys(childs).forEach(function(id) {
			var child = childs[id];
			childs[id] = prepare_doc(child);
		});
	}

	return tmp;
}

/** Prepare docs for publification */
function prepare_docs(docs) {
	debug.assert(docs).is('array');
	return ARRAY(docs).map(prepare_doc).valueOf();
}

/** Current connection */
var db;

/** Are we in a transaction? */
var is_transaction;

/** Actual command implementations */
var commands = module.exports = {};

/** Connect */
commands.connect = function(args) {
	if(db) { throw new TypeError("connection started already"); }
	var traits = {};
	if(args.traits) {
		traits = merge({}, args.traits);
	}
	traits.timeout = parseInt(args.timeout || traits.timeout || 0, 10) || undefined;
	return nopg.connect(args.pg, traits).then(function(db_) {
		debug.assert(db_).is('object');
		debug.assert(db_.once).is('function');
		db = globals.db = db_;
		db.once('timeout', function() {
			return commands.exit();
		});
		return process.pid;
	});
};

/** Start transaction */
commands.start = function(args) {
	if(db) { throw new TypeError("connection started already"); }
	var traits = {};
	if(args.traits) {
		traits = merge({}, args.traits);
	}
	traits.timeout = parseInt(args.timeout || traits.timeout || 0, 10) || undefined;
	return nopg.start(args.pg, traits).then(function(db_) {
		debug.assert(db_).is('object');
		debug.assert(db_.once).is('function');
		is_transaction = true;
		db = globals.db = db_;
		db.once('timeout', function() {
			return commands.exit();
		});
		return process.pid;
	});
};

/** Commit transaction */
commands.commit = function() {
	if(!db) { throw new TypeError("connection not started"); }
	return db.commit().then(function() {
		db = globals.db = undefined;
		if(globals.server) {
			globals.server.close();
		}
	});
};

/** Rollback transaction */
commands.rollback = function() {
	if(!db) { throw new TypeError("connection not started"); }
	return db.rollback().then(function() {
		db = undefined;
		if(globals.server) {
			globals.server.close();
		}
	});
};

/** Count documents */
commands.count = function(args) {
	if(!db) { throw new TypeError("connection not started"); }
	debug.assert(args).is('object');
	var type = args._.shift();
	var where = args.where;
	var traits = args.traits;
	return db.count(type)(where, traits).then(function(db_) {
		return db_.fetch();
	});
};

/** Search document types */
commands.types = function(args) {
	if(!db) { throw new TypeError("connection not started"); }
	debug.assert(args).is('object');
	var where = args.where;
	var traits = args.traits;
	return db.searchTypes(where, traits).then(function(db_) {
		return prepare_types(db_.fetch());
	});
};

/** Get document type */
commands.type = function(args) {
	if(!db) { throw new TypeError("connection not started"); }
	debug.assert(args).is('object');
	var type = args._.shift();
	return db.getType(type).then(function(db_) {
		return prepare_type(db_.fetch());
	});
};

/** Search documents */
commands.search = function(args) {
	if(!db) { throw new TypeError("connection not started"); }
	debug.assert(args).is('object');
	var type = args._.shift();
	var where = args.where;
	var traits = args.traits;
	debug.log(
		'type = ', type, '\n',
		'where = ', where, '\n',
		'traits = ', traits
	);
	return db.search(type)(where, traits).then(function(db_) {
		return prepare_docs(db_.fetch());
	});
};

/** Create document */
commands.create = function(args) {
	if(!db) { throw new TypeError("connection not started"); }
	debug.assert(args).is('object');
	var type = args._.shift();
	var set = args.set;
	debug.assert(set).is('object');
	return db.create(type)(set).then(function(db_) {
		return prepare_doc(db_.fetch());
	});
};

/** Update document(s) */
commands.update = function(args) {
	if(!db) { throw new TypeError("connection not started"); }
	debug.assert(args).is('object');
	var type = args._.shift();
	var where = args.where;
	var set = args.set;
	var traits = args.traits;
	var results = [];
	return db.search(type)(where, traits).then(function(db_) {
		var docs = db.fetch();
		return ARRAY(docs).map(function step_builder(doc) {
			return function step() {

				// If doc already has some of the properties of set's object properties, we must merge them, so we don't lose data.
				ARRAY(Object.keys(set)).forEach(function(key) {
					if(!doc.hasOwnProperty(key)) {
						return;
					}
					if(!is.obj(doc[key])) {
						return;
					}
					if(!is.obj(set[key])) {
						return;
					}
					set[key] = merge({}, doc[key], set[key]);
				});

				return db_.update(doc, set).then(function(db__) {
					var doc_ = db__.fetch();
					results.push(prepare_doc(doc_));
				});
			};
		}).reduce(_Q.when, _Q());
	}).then(function() {
		return results;
	});
};

/** Delete document(s) */
commands.delete = function(args) {
	if(!db) { throw new TypeError("connection not started"); }
	debug.assert(args).is('object');
	var type = args._.shift();
	var where = args.where;
	var traits = args.traits;
	return db.search(type)(where, traits).then(function(db_) {
		var docs = db.fetch();
		return ARRAY(docs).map(function step_builder(doc) {
			return function step() {
				return db_.del(doc);
			};
		}).reduce(_Q.when, _Q());
	}).then(function() {
		return;
	});
};

/** Exit */
commands.exit = function() {
	if(globals.server) {
		globals.server.close();
	}
};

var spawn = require('child_process').spawn;

/** Returns a listener function */
function build_listener(command, args) {
	return function listener(id, event, type) {
		_Q.fcall(function() {
			var env = {
				'NOPG_TR': process.pid,
				'NOPG_EVENT_ID': id,
				'NOPG_EVENT_NAME': event,
				'NOPG_EVENT_TYPE': type
			};
			var cmd = spawn(command, args, {
				env: merge({}, process.env, env),
				'stdio': ['ignore', process.stdout, process.stderr]
			});
			cmd.on('close', function(code) {
				if(code !== 0) {
					debug.error("child process ", command, " for ", event, " exited with code ", code);
				}
			});
		}).fail(function(err) {
			debug.error('Error: ', err);
		}).done();
	};
}

/** On */
commands.on = function(args) {
	if(!db) { throw new TypeError("connection not started"); }

	if(is_transaction) {
		throw new TypeError("listening events are disabled inside of a transaction!");
	}

	debug.assert(args).is('object');
	var event = args._.shift();
	var command = args._.shift();
	var command_args = args._;

	last_listener_id += 1;
	var listener_id = last_listener_id;
	var listener = build_listener(command, command_args);
	listeners[listener_id] = {'event': event, 'listener': listener};
	return db.on(event, listener).then(function() {
		return process.pid + '@' + listener_id;
	});
};

/** Once */
commands.once = function(args) {
	if(!db) { throw new TypeError("connection not started"); }

	if(is_transaction) {
		throw new TypeError("listening events are disabled inside of a transaction!");
	}

	debug.assert(args).is('object');
	var event = args._.shift();
	var command = args._.shift();
	var command_args = args._;

	last_listener_id += 1;
	var listener_id = last_listener_id;
	var listener = build_listener(command, command_args);
	listeners[listener_id] = {'event': event, 'listener': listener};
	return db.once(event, listener).then(function() {
		return process.pid + '@' + listener_id;
	});
};

/** removeListener */
commands.stop = function(args) {
	if(!db) { throw new TypeError("connection not started"); }

	if(is_transaction) {
		throw new TypeError("listening events are disabled inside of a transaction!");
	}

	debug.assert(args).is('object');
	var parts = args._.shift().split('@');
	var listener_pid = parts.shift();
	if(listener_pid !== process.pid) {
		throw new TypeError("Not my listener!");
	}
	var listener_id = parts.shift();
	var listener = listeners[listener_id];
	return db.removeListener(listener.event, listener.listener).then(function() {
		return;
	});
};
