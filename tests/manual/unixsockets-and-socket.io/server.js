"use strict";

const path = './server.sock';

var app = require('http').createServer(function(req, res) {
	console.log('Request for ' + req.url);
	res.statusCode = 200;
	res.setHeader('Content-Type', 'text/plain');
	res.end('Hello World\n');
});

var io = require('socket.io')(app);

io.on('connection', function (socket) {
	socket.emit('news', { hello: 'world' });
	socket.on('my other event', function (data) {
		console.log(data);
	});
});

app.listen(path, function() {
	console.log(`Server running at ${path}`);
});
