const fs = require('fs');

let logger = [];

logger.log = function (message, type = 'info') {
    let date = new Date();
    let log = `[${date.toISOString()}] [${type.toUpperCase()}] ${message}`;
    console.log(log);
    fs.appendFileSync('logs.log', log + '\n');
};

logger.info = function (message) {
    this.log(message, 'info');
};

logger.warn = function (message) {
    this.log(message, 'warn');
};

logger.error = function (err) {
    let errorMessage = 'An error occurred';
    let stackTrace = '';

    if (err instanceof Error) {
        errorMessage = err.message || errorMessage;
        stackTrace = err.stack || '';
    } else if (typeof err === 'string') {
        errorMessage = err;
    }

    const logMessage = `[${new Date().toISOString()}] [ERROR] ${errorMessage}\nStack Trace:\n${stackTrace}\n`;
    console.error(logMessage);
    fs.appendFileSync('logs.log', logMessage + '\n');
};

logger.debug = function (message) {
    let date = new Date();
    let stack = new Error().stack.split('\n')[2].trim();
    let log = `[${date.toISOString()}] [DEBUG] ${message} (from ${stack})`;
    fs.appendFileSync('debug.log', log + '\n');
};

module.exports = logger;
