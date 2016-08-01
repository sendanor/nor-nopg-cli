
var debug = require('nor-debug');
var PATH = require('path');

var common = module.exports = {};

/** Returns user home directory */
common.getHomePath = function() {
	return PATH.resolve(process.env.HOME || process.cwd());
};

/** Returns the socket path for pid */
common.getUDSPath = function(pid) {
	debug.assert(pid).is('integer');
	return PATH.join(common.getHomePath(), '.nopg', ''+pid+'.sock');
};
