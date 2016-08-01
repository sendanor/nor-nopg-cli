"use strict";

const path = './server.sock';

var socket = require('socket.io-client')('ws+unix://' + require('path').resolve(path));
socket.on('connect', function(){
	console.log('connect');
});
socket.on('event', function(data){
	console.log('event: ', data);
});
socket.on('disconnect', function(){
	console.log('disconnect');
});

