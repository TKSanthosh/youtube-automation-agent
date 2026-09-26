const winston = require('winston');
const path = require('path');
const fs = require('fs');
const chalk = require('chalk');

class Logger {
  constructor(component = 'System') {
    this.component = component;
    this.winston = this.createWinstonLogger();
  }

  createWinstonLogger() {
    const logDir = path.join(__dirname, '..', 'logs');
    if (!fs.existsSync(logDir)) {
      try {
        fs.mkdirSync(logDir, { recursive: true });
      } catch (_) {
        // ignore
      }
    }
    
    const transports = [];
    if (process.env.NODE_ENV !== 'test') {
      transports.push(
        // Write all logs to combined.log
        new winston.transports.File({ 
          filename: path.join(logDir, 'combined.log'),
          maxsize: 104857600, // 100MB
          maxFiles: 5,
        }),
        // Write error logs to error.log
        new winston.transports.File({ 
          filename: path.join(logDir, 'error.log'), 
          level: 'error',
          maxsize: 52428800, // 50MB
          maxFiles: 3,
        }),
        // Write agent-specific logs
        new winston.transports.File({
          filename: path.join(logDir, `${this.component.toLowerCase()}.log`),
          maxsize: 20971520, // 20MB
          maxFiles: 3,
        })
      );
    } else {
      transports.push(new winston.transports.Console({ silent: true }));
    }

    const logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { component: this.component },
      transports
    });

    // Prevent unhandled EPERM errors if another process holds file lock on Windows
    logger.on('error', () => {});
    if (logger.transports) {
      logger.transports.forEach(t => t.on('error', () => {}));
    }

    return logger;
  }

  info(message, ...args) {
    try {
      this.winston.info(message, ...args);
    } catch (_) {}
    console.log(this.formatConsoleMessage('INFO', message, chalk.blue));
  }

  success(message, ...args) {
    try {
      this.winston.info(message, ...args);
    } catch (_) {}
    console.log(this.formatConsoleMessage('SUCCESS', message, chalk.green));
  }

  warn(message, ...args) {
    try {
      this.winston.warn(message, ...args);
    } catch (_) {}
    console.log(this.formatConsoleMessage('WARN', message, chalk.yellow));
  }

  error(message, error = null, ...args) {
    try {
      if (error) {
        this.winston.error(message, { error: error.message, stack: error.stack, ...args });
      } else {
        this.winston.error(message, ...args);
      }
    } catch (_) {}
    console.log(this.formatConsoleMessage('ERROR', message, chalk.red));
    if (error && process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
      console.error(chalk.red(error.stack));
    }
  }

  debug(message, ...args) {
    try {
      this.winston.debug(message, ...args);
    } catch (_) {}
    if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
      console.log(this.formatConsoleMessage('DEBUG', message, chalk.gray));
    }
  }

  formatConsoleMessage(level, message, colorFunc) {
    const timestamp = new Date().toLocaleTimeString();
    const componentTag = chalk.cyan(`[${this.component}]`);
    const levelTag = colorFunc(`[${level}]`);
    
    return `${chalk.gray(timestamp)} ${componentTag} ${levelTag} ${message}`;
  }

  // Method to create specialized loggers for different purposes
  static createAgentLogger(agentName) {
    return new Logger(agentName);
  }

  static createSystemLogger() {
    return new Logger('System');
  }

  static createAPILogger() {
    return new Logger('API');
  }

  // Performance logging
  startTimer(label) {
    const startTime = Date.now();
    return {
      end: () => {
        const duration = Date.now() - startTime;
        this.info(`${label} completed in ${duration}ms`);
        return duration;
      }
    };
  }

  // Structured logging for important events
  logEvent(eventType, data = {}) {
    try {
      this.winston.info('System Event', {
        eventType,
        timestamp: new Date().toISOString(),
        ...data
      });
    } catch (_) {}
  }

  // Log content generation pipeline
  logContentPipeline(stage, contentId, status, data = {}) {
    try {
      this.winston.info('Content Pipeline', {
        stage,
        contentId,
        status,
        timestamp: new Date().toISOString(),
        ...data
      });
    } catch (_) {}
  }

  // Log publishing events
  logPublishing(action, videoId, status, data = {}) {
    try {
      this.winston.info('Publishing Event', {
        action,
        videoId,
        status,
        timestamp: new Date().toISOString(),
        ...data
      });
    } catch (_) {}
  }

  // Log analytics events
  logAnalytics(videoId, metrics, insights = []) {
    try {
      this.winston.info('Analytics Update', {
        videoId,
        metrics,
        insights,
        timestamp: new Date().toISOString()
      });
    } catch (_) {}
  }

  // Log errors with context
  logErrorWithContext(error, context = {}) {
    try {
      this.winston.error('System Error', {
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name
        },
        context,
        timestamp: new Date().toISOString()
      });
    } catch (_) {}
  }
}

module.exports = { Logger };