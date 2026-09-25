const levels = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = levels[process.env.LOG_LEVEL || 'info'] ?? levels.info;

const consoleMethods = { error: 'error', warn: 'warn', info: 'log', debug: 'log' };

const logger = {};
for (const [name, level] of Object.entries(levels)) {
  logger[name] = (...args) => {
    if (level <= currentLevel) {
      const prefix = `[${new Date().toISOString()}] [${name.toUpperCase()}]`;
      console[consoleMethods[name]](prefix, ...args);
    }
  };
}

module.exports = logger;
