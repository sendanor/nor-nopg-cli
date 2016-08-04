"use strict";

var is = require('nor-is');
var debug = require('nor-debug');
var merge = require('merge');
var nopg = require('nor-nopg');
var ARRAY = require('nor-array');
var _Q = require('q');

/** Increase default transaction timeout to 60 minutes */
nopg.defaults.timeout = 3600*1000;

var globals = require('./globals.js');

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

/** Current transaction */
var db;

/** Actual command implementations */
var commands = module.exports = {};

/** Start transaction */
commands.start = function(args) {
	if(db) { throw new TypeError("transaction started already"); }
	return nopg.start(args.pg).then(function(db_) {
		db = globals.db = db_;
		return process.pid;
	});
};

/** Commit transaction */
commands.commit = function() {
	if(!db) { throw new TypeError("transaction not started"); }
	return db.commit().then(function() {
		db = globals.db = undefined;
		if(globals.server) {
			globals.server.close();
		}
	});
};

/** Rollback transaction */
commands.rollback = function() {
	if(!db) { throw new TypeError("transaction not started"); }
	return db.rollback().then(function() {
		db = undefined;
		if(globals.server) {
			globals.server.close();
		}
	});
};

/** Count documents */
commands.count = function(args) {
	if(!db) { throw new TypeError("transaction not started"); }
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
	if(!db) { throw new TypeError("transaction not started"); }
	debug.assert(args).is('object');
	var where = args.where;
	var traits = args.traits;
	return db.searchTypes(where, traits).then(function(db_) {
		return prepare_types(db_.fetch());
	});
};

/** Get document type */
commands.type = function(args) {
	if(!db) { throw new TypeError("transaction not started"); }
	debug.assert(args).is('object');
	var type = args._.shift();
	return db.getType(type).then(function(db_) {
		return prepare_type(db_.fetch());
	});
};

/** Search documents */
commands.search = function(args) {
	if(!db) { throw new TypeError("transaction not started"); }
	debug.assert(args).is('object');
	var type = args._.shift();
	var where = args.where;
	var traits = args.traits;
	return db.search(type)(where, traits).then(function(db_) {
		return prepare_docs(db_.fetch());
	});
};

/** Create document */
commands.create = function(args) {
	if(!db) { throw new TypeError("transaction not started"); }
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
	if(!db) { throw new TypeError("transaction not started"); }
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
	if(!db) { throw new TypeError("transaction not started"); }
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
