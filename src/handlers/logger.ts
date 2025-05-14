/**
 * ╳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╳
 *      AirLink - Open Source Project by AirlinkLabs
 *      Repository: https://github.com/airlinklabs/panel
 *
 *     © 2024 AirlinkLabs. Licensed under the MIT License
 * ╳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╳
 */

import { createConsola, ConsolaInstance } from 'consola';
import fs from 'fs';
import path from 'path';

// Create logs directory if it doesn't exist
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// ANSI color codes for prettier output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  blink: '\x1b[5m',
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgBlack: '\x1b[40m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m',
};

// Disable consola's default date formatting as we'll handle it ourselves
const consola = createConsola({
  level: process.env.NODE_ENV === 'development' ? 4 : 3,
  fancy: true,
  formatOptions: {
    date: false, // Disable default date formatting
    colors: true,
    compact: process.env.NODE_ENV === 'production',
  },
}) as ConsolaInstance;

// Wrap console to redirect all console.* calls to consola
consola.wrapConsole();

// Wrap process stdout/stderr
consola.wrapAll();

// Helper function to write to log files
const writeToLogFile = (level: string, message: string): void => {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${level}: ${message}\n`;
  fs.appendFile(path.join(logsDir, 'combined.log'), logMessage, (err) => {
    if (err) consola.error('Failed to write to combined log file:', err);
  });
};

// Format timestamp consistently
const getTimestamp = (): string => {
  const now = new Date();
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const seconds = now.getSeconds().toString().padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
};

// Format message with fixed width columns and timestamp
const formatLogMessage = (badge: string, message: string, maxWidth = 120): string => {
  const timestamp = `${colors.dim}${getTimestamp()}${colors.reset}`;
  const padding = ' '.repeat(Math.max(0, maxWidth - (badge.length + message.length + timestamp.length)));
  
  return `${badge} ${message}${padding}${timestamp}`;
};

// Create a logger interface that matches the existing API
const logger = {
  error(message: string, error?: unknown): void {
    const badge = `${colors.bgRed}${colors.white}${colors.bright} ERROR ${colors.reset}`;
    
    if (error instanceof Error) {
      const formattedMessage = formatLogMessage(badge, message);
      consola.error(formattedMessage, error);
    } else {
      const formattedMessage = formatLogMessage(badge, `${message}: ${error}`);
      consola.error(formattedMessage);
    }

    // Write to error log file
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ERROR: ${message}: ${error}\n`;
    fs.appendFile(path.join(logsDir, 'error.log'), logMessage, (err) => {
      if (err) consola.error('Failed to write to error log file:', err);
    });
  },

  warn(message: any): void {
    const badge = `${colors.bgYellow}${colors.black}${colors.bright} WARN ${colors.reset}`;
    const formattedMessage = formatLogMessage(badge, message);
    consola.warn(formattedMessage);
    
    // Write to combined log file
    writeToLogFile('WARN', String(message));
  },

  info(message: any): void {
    // Add emojis based on message content for better visual feedback
    let emoji = '📢'; // default info emoji
    let color = colors.blue;
    
    if (message.toLowerCase().includes('database')) { 
      emoji = '🔋'; 
      color = colors.green;
    }
    if (message.toLowerCase().includes('server')) { 
      emoji = '🚀'; 
      color = colors.magenta;
    }
    if (message.toLowerCase().includes('loading')) { 
      emoji = '📦'; 
      color = colors.cyan;
    }
    if (message.toLowerCase().includes('started')) { 
      emoji = '✨'; 
      color = colors.green;
    }
    if (message.toLowerCase().includes('connected')) { 
      emoji = '🔌'; 
      color = colors.green;
    }
    if (message.toLowerCase().includes('created')) { 
      emoji = '✅'; 
      color = colors.green;
    }
    if (message.toLowerCase().includes('stats')) { 
      emoji = '📊'; 
      color = colors.yellow;
    }
    if (message.toLowerCase().includes('addon')) { 
      emoji = '🧩'; 
      color = colors.magenta;
    }
    if (message.toLowerCase().includes('player')) { 
      emoji = '👥'; 
      color = colors.cyan;
    }
    
    const badge = `${colors.bgBlue}${colors.white}${colors.bright} INFO ${colors.reset}`;
    const formattedMessage = formatLogMessage(badge, `${color}${emoji}  ${message}${colors.reset}`);
    consola.info(formattedMessage);
    
    // Write to combined log file
    writeToLogFile('INFO', String(message));
  },

  success(message: any): void {
    const badge = `${colors.bgGreen}${colors.black}${colors.bright} SUCCESS ${colors.reset}`;
    const formattedMessage = formatLogMessage(badge, `✨ ${message}`);
    consola.success(formattedMessage);
    
    // Write to combined log file
    writeToLogFile('SUCCESS', String(message));
  },

  debug(message: any, ...args: any[]): void {
    if (process.env.NODE_ENV === 'development') {
      const badge = `${colors.bgMagenta}${colors.white}${colors.bright} DEBUG ${colors.reset}`;
      
      if (args.length > 0) {
        const formattedMessage = formatLogMessage(badge, `🔍 ${message}`);
        consola.debug(formattedMessage, ...args);
      } else {
        const formattedMessage = formatLogMessage(badge, `🔍 ${message}`);
        consola.debug(formattedMessage);
      }
      
      // Write to combined log file
      writeToLogFile('DEBUG', [message, ...args].map(arg => String(arg)).join(' '));
    }
  },

  log(message: any, ...args: any[]): void {
    // Add box formatting for important messages
    if (typeof message === 'string' && 
       (message.toLowerCase().includes('started') || 
        message.toLowerCase().includes('ready') || 
        message.toLowerCase().includes('listening'))) {
      this.box({
        title: '🚀 Server Status',
        message: `${message} ${args.join(' ')}`,
        style: {
          padding: 1,
          borderColor: 'green',
          titleColor: 'green'
        }
      });
    } else {
      const badge = `${colors.bgWhite}${colors.black}${colors.bright} LOG ${colors.reset}`;
      
      if (args.length > 0) {
        const formattedMessage = formatLogMessage(badge, message);
        consola.log(formattedMessage, ...args);
      } else {
        const formattedMessage = formatLogMessage(badge, message);
        consola.log(formattedMessage);
      }
    }
    
    // Write to combined log file
    writeToLogFile('LOG', [message, ...args].map(arg => String(arg)).join(' '));
  },

  box(options: string | { title?: string; message: string | string[]; style?: any }): void {
    if (typeof options === 'string') {
      // Create a fancier box with double borders and gradient colors
      const lines = options.split('\n');
      const maxLength = Math.max(...lines.map(line => line.length));
      const topBorder = `╔${'═'.repeat(maxLength + 2)}╗`;
      const bottomBorder = `╚${'═'.repeat(maxLength + 2)}╝`;
      
      console.log('\n' + colors.cyan + colors.bright + topBorder + colors.reset);
      lines.forEach(line => {
        console.log(colors.cyan + colors.bright + '║ ' + colors.reset + 
                   colors.white + line + 
                   ' '.repeat(maxLength - line.length) + 
                   colors.cyan + colors.bright + ' ║' + colors.reset);
      });
      console.log(colors.cyan + colors.bright + bottomBorder + colors.reset + '\n');
    } else {
      const title = options.title || '';
      const messages = Array.isArray(options.message) ? options.message : [options.message];
      const style = options.style || {};
      const borderColor = style.borderColor || 'cyan';
      const titleColor = style.titleColor || borderColor;
      const padding = style.padding || 1;
      
      // Calculate width based on the longest line
      const maxLength = Math.max(title.length, ...messages.map(msg => String(msg).length));
      const width = maxLength + (padding * 2) + 4; // +4 for the border characters and inner padding
      
      // Create the box
      const horizontalBorder = '═'.repeat(width - 2);
      const emptyLine = '║' + ' '.repeat(width - 2) + '║';
      
      // Top border with title if provided
      let topBorder = '';
      if (title) {
        const titlePadding = Math.floor((width - title.length - 4) / 2);
        topBorder = '╔' + '═'.repeat(titlePadding) + ` ${title} ` + '═'.repeat(width - 4 - title.length - titlePadding) + '╗';
      } else {
        topBorder = '╔' + horizontalBorder + '╗';
      }
      
      // Output the box
      const colorCode = colors[borderColor as keyof typeof colors] || colors.cyan;
      const titleColorCode = colors[titleColor as keyof typeof colors] || colorCode;
      
      // Get timestamp for alignment
      const timestamp = `${colors.dim}${getTimestamp()}${colors.reset}`;
      const timestampPadding = ' '.repeat(Math.max(0, 100 - width - timestamp.length));
      
      console.log('\n' + colorCode + colors.bright + topBorder + colors.reset + timestampPadding + timestamp);
      
      // Add padding at the top
      for (let i = 0; i < padding; i++) {
        console.log(colorCode + colors.bright + emptyLine + colors.reset + timestampPadding + timestamp);
      }
      
      // Add messages
      messages.forEach(msg => {
        const msgStr = String(msg);
        const msgPadding = ' '.repeat(padding);
        // Ensure consistent content width
        const remainingSpace = width - 2 - padding * 2;
        const lineContent = msgPadding + msgStr + ' '.repeat(Math.max(0, remainingSpace - msgStr.length)) + msgPadding;
        console.log(colorCode + colors.bright + '║' + colors.reset + lineContent + colorCode + colors.bright + '║' + colors.reset + timestampPadding + timestamp);
      });
      
      // Add padding at the bottom
      for (let i = 0; i < padding; i++) {
        console.log(colorCode + colors.bright + emptyLine + colors.reset + timestampPadding + timestamp);
      }
      
      console.log(colorCode + colors.bright + '╚' + horizontalBorder + '╝' + colors.reset + timestampPadding + timestamp + '\n');
    }
    
    // Write to combined log file
    const message = typeof options === 'string' ? options : 
      `${options.title ? `[${options.title}] ` : ''}${Array.isArray(options.message) ? options.message.join(' | ') : options.message}`;
    writeToLogFile('BOX', message);
  }
};

export default logger;
