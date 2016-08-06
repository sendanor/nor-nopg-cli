/* TCN event test */
"use strict";
var debug = require('nor-debug');
var _Q = require('q');
var PGCONFIG = process.env.PGCONFIG;
var pg = require('nor-pg');

_Q.fcall(function() {

	return pg.start(PGCONFIG).then(function(db) {

		db.on('notification', function(data) {
			debug.log('data =', data);
		});

		return db.query('LISTEN tcn');
	});

}).fail(function(err) {
	debug.error(err);
}).done();
