"use strict";
/**
 * ╳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╳
 *      AirLink - Open Source Project by AirlinkLabs
 *      Repository: https://github.com/airlinklabs/airlink
 *
 *     © 2024 AirlinkLabs. Licensed under the MIT License
 * ╳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╳
 */
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require('fs');
const path = require('path');
var colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    gray: '\x1b[90m',
    bgRed: '\x1b[41m',
    bgGreen: '\x1b[42m',
    bgYellow: '\x1b[43m',
    bgBlue: '\x1b[44m',
    bgMagenta: '\x1b[45m',
    bgCyan: '\x1b[46m',
    bgWhite: '\x1b[47m',
};
var logLevels = {
    error: {
        color: colors.red,
        bgColor: colors.bgRed,
        icon: '✖',
        label: 'ERROR',
    },
    warn: {
        color: colors.yellow,
        bgColor: colors.bgYellow,
        icon: '⚠',
        label: 'WARN',
    },
    info: {
        color: colors.blue,
        bgColor: colors.bgBlue,
        icon: 'ℹ',
        label: 'INFO',
    },
    success: {
        color: colors.green,
        bgColor: colors.bgGreen,
        icon: '✔',
        label: 'SUCCESS',
    },
    debug: {
        color: colors.magenta,
        bgColor: colors.bgMagenta,
        icon: '⚙',
        label: 'DEBUG',
    },
};
var logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}
var Logger = /** @class */ (function () {
    function Logger() {
        // eslint-disable-next-line no-console
        this.originalConsoleLog = console.log;
    }
    Logger.prototype.getTimestamp = function () {
        var now = new Date();
        return now.toISOString().replace('T', ' ').split('.')[0];
    };
    Logger.prototype.formatMessage = function (level, message) {
        var _a = logLevels[level], color = _a.color, bgColor = _a.bgColor, icon = _a.icon, label = _a.label;
        var timestamp = this.getTimestamp();
        var consoleOutput = "".concat(colors.gray).concat(timestamp).concat(colors.reset, " ").concat(color).concat(icon, " ").concat(bgColor).concat(colors.bright).concat(label).concat(colors.reset, " ").concat(color).concat(message).concat(colors.reset);
        var fileOutput = "[".concat(timestamp, "] ").concat(label, ": ").concat(message, "\n");
        var logFile = path.join(logsDir, level === 'error' ? 'error.log' : 'combined.log');
        try {
            fs.appendFileSync(logFile, fileOutput);
        }
        catch (err) {
            this.originalConsoleLog("Failed to write to log file: ".concat(err));
        }
        return consoleOutput;
    };
    Logger.prototype.error = function (message, error) {
        var errorMessage = error instanceof Error ? error.message : String(error);
        var formattedMessage = this.formatMessage('error', "".concat(message, ": ").concat(errorMessage));
        this.originalConsoleLog(formattedMessage);
    };
    Logger.prototype.warn = function (message) {
        var formattedMessage = this.formatMessage('warn', String(message));
        this.originalConsoleLog(formattedMessage);
    };
    Logger.prototype.info = function (message) {
        var formattedMessage = this.formatMessage('info', String(message));
        this.originalConsoleLog(formattedMessage);
    };
    Logger.prototype.success = function (message) {
        var formattedMessage = this.formatMessage('success', String(message));
        this.originalConsoleLog(formattedMessage);
    };
    Logger.prototype.debug = function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        if (process.env.NODE_ENV === 'development') {
            var message = args
                .map(function (arg) {
                return typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg);
            })
                .join(' ');
            var formattedMessage = this.formatMessage('debug', message);
            this.originalConsoleLog(formattedMessage);
        }
    };
    Logger.prototype.log = function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        var message = args
            .map(function (arg) {
            return typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg);
        })
            .join(' ');
        this.info(message);
    };
    return Logger;
}());
var logger = new Logger();
exports.default = logger;
