import { createConsola } from 'consola';

// Create a custom consola instance with our preferred configuration
const logger = createConsola({
  // Set default level to 4 (debug) in development, 3 (info) in production
  level: process.env.NODE_ENV === 'development' ? 4 : 3,
  // Enable fancy output with colors and formatting
  fancy: true,
  formatOptions: {
    // Enable date display in logs
    date: true,
    // Enable colors
    colors: true,
    // Compact mode for production
    compact: process.env.NODE_ENV === 'production',
  },
});

// Wrap console to redirect all console.* calls to consola
logger.wrapConsole();

// Wrap process stdout/stderr
logger.wrapAll();

// Export the logger instance
export default logger;

// Example usage:
/*
import logger from '@/utils/core/logger';

logger.info('Server started');
logger.success('Database connected');
logger.warn('Deprecated feature used');
logger.error('Something went wrong', new Error('Details here'));
logger.debug('Debug information');
logger.trace('Detailed trace info');
logger.fatal('Critical error occurred');

// Pretty boxes for important messages
logger.box('Server is running on http://localhost:3000');

// Async prompt (if needed)
await logger.prompt('Are you sure you want to proceed?', {
  type: 'confirm'
});
*/ 