type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: '\x1b[90m',  // gray
  info: '\x1b[36m',   // cyan
  warn: '\x1b[33m',   // yellow
  error: '\x1b[31m',  // red
};

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

let currentLevel: LogLevel = 'info';

/** Set the minimum log level */
export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

function formatTimestamp(): string {
  return new Date().toISOString().slice(11, 23);
}

function log(level: LogLevel, prefix: string, message: string, ...args: unknown[]): void {
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[currentLevel]) return;

  const color = LEVEL_COLORS[level];
  const timestamp = formatTimestamp();
  const formatted = `${color}${timestamp} [${prefix.padEnd(8)}]${RESET} ${message}`;

  if (level === 'error') {
    console.error(formatted, ...args);
  } else if (level === 'warn') {
    console.warn(formatted, ...args);
  } else {
    console.log(formatted, ...args);
  }
}

/** Create a logger with a specific prefix */
export function createLogger(prefix: string) {
  return {
    debug: (msg: string, ...args: unknown[]) => log('debug', prefix, msg, ...args),
    info: (msg: string, ...args: unknown[]) => log('info', prefix, msg, ...args),
    warn: (msg: string, ...args: unknown[]) => log('warn', prefix, msg, ...args),
    error: (msg: string, ...args: unknown[]) => log('error', prefix, msg, ...args),
    /** Log a step in a pipeline */
    step: (step: number, total: number, msg: string) => {
      log('info', prefix, `${BOLD}[${step}/${total}]${RESET} ${msg}`);
    },
    /** Log pipeline stage start */
    stage: (name: string) => {
      console.log(`\n${BOLD}${LEVEL_COLORS.info}━━━ ${name} ━━━${RESET}\n`);
    },
  };
}
