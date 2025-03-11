const log4js = require('log4js');
const path = require('path');
const fs = require('fs');

const logsDir = path.join(__dirname, '..', '..', 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
}

function getLogger(scriptName) {
    const scriptLogDir = path.join(logsDir, scriptName); 
    if (!fs.existsSync(scriptLogDir)) {
        fs.mkdirSync(scriptLogDir);
    }

    const date = new Date();
    const formattedDate = `${date.getHours()}-${date.getMinutes()}-${date.getDate()}-${date.getMonth() + 1}-${date.getFullYear()}`;
    const logFileName = path.join(scriptLogDir, `${formattedDate}.log`);

    console.log(`Logging to: ${logFileName}`);

    log4js.configure({
        appenders: {
            console: { type: 'console' },
            file: { type: 'file', filename: logFileName }
        },
        categories: { default: { appenders: ['console', 'file'], level: 'debug' } } // You can adjust the log level
    });

    const logger = log4js.getLogger(scriptName);
    logger.info(`Logger initialized for ${scriptName}`);
    return logger;
}

module.exports = getLogger;
