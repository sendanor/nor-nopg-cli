"use strict";

var debug = require('nor-debug');
var nopg = require('nor-nopg');
var ARRAY = require('nor-array');
var _Q = require('q');

/** Increase default transaction timeout to 5 minutes */
nopg.defaults.timeout = 300*1000;

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
	var type = args._.shift();
	var where = args.where;
	var traits = args.traits;
	return db.count(type)(where, traits).then(function(db_) {
		return db.fetch();
	});
};

/** Search documents */
commands.search = function(args) {
	if(!db) { throw new TypeError("transaction not started"); }
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
	var type = args._.shift();
	var set = args.set;
	var traits = args.traits;
	return db.create(type)(set, traits).then(function(db_) {
		return prepare_doc(db.fetch());
	});
};

/** Update document(s) */
commands.update = function(args) {
	if(!db) { throw new TypeError("transaction not started"); }
	var type = args._.shift();
	var where = args.where;
	var set = args.set;
	var traits = args.traits;
	var results = [];
	return db.search(type)(where, traits).then(function(db_) {
		var docs = db.fetch();
		return ARRAY(docs).map(function step_builder(doc) {
			return function step() {
				return db_.update(doc, set).then(function(doc_) {
					results.push(doc_);
				});
			};
		}).reduce(_Q.when, _Q());
	}).then(function() {
		return prepare_docs(results);
	});
};

/** Delete document(s) */
commands.delete = function(args) {
	if(!db) { throw new TypeError("transaction not started"); }
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
	});
};

/** Exit */
commands.exit = function() {
	if(globals.server) {
		globals.server.close();
	}
};
