"use strict";

var PGCONFIG = process.env.PGCONFIG || '';

var create_client = require('./lib/client.js');

var client = create_client('./server.sock');

client('start', [PGCONFIG]).then(function() {
	return client('search', ['User']).then(function(body) {
		console.log('body: ', JSON.stringify(body, null, 2));
		return client('commit');
	});
}).then(function() {
	console.log('Done!');
}).fail(function(err) {
	console.log('Error: ' + err.stack);
}).done();
