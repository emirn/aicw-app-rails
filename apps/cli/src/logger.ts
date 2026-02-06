import { promises as fs } from 'fs';
import chalk from 'chalk';

/**
 * Logger utility for CLI output and file logging
 * All log output goes to stderr to keep stdout clean for JSON
 */
export class Logger {
  private lines: string[] = [];
  private useColors: boolean;

  constructor(useColors = true) {
    // Disable colors if not a TTY (e.g., piped output, CI)
    this.useColors = useColors && process.stderr.isTTY !== false;
  }

  log(message: string): void {
    const timestamp = new Date().toISOString();
    const rawLine = `[${timestamp}] ${message}`;
    this.lines.push(rawLine);

    const output = this.useColors ? this.colorize(timestamp, message) : rawLine;
    process.stderr.write(output + '\n');
  }

  private colorize(timestamp: string, message: string): string {
    const ts = chalk.dim(`[${timestamp}]`);

    // Error patterns - red
    if (/FAILED|Error|error|FAIL|failed/i.test(message)) {
      return `${ts} ${chalk.red(message)}`;
    }

    // Success patterns - green
    if (/DONE|created|complete|success|Updated article/i.test(message) || message.includes('✓')) {
      return `${ts} ${chalk.green(message)}`;
    }

    // Cost info - highlight dollar amounts in cyan
    if (/\$\d+(\.\d+)?/.test(message)) {
      const highlighted = message.replace(/\$\d+(\.\d+)?/g, (m) => chalk.cyan(m));
      return `${ts} ${highlighted}`;
    }

    // Processing info - yellow for "Processing:" lines
    if (/Processing:|Running .* pipeline/i.test(message)) {
      return `${ts} ${chalk.yellow(message)}`;
    }

    return `${ts} ${message}`;
  }

  /**
   * Log debug information with magenta color
   * Used to display AI prompts and responses when debug mode is enabled
   */
  logDebug(label: string, content: string): void {
    const maxLen = 3000;
    const truncated = content.length > maxLen
      ? content.slice(0, maxLen) + '\n... (truncated)'
      : content;

    if (this.useColors) {
      process.stderr.write(chalk.magenta(`[DEBUG ${label}]\n`) + chalk.dim(truncated) + '\n');
    } else {
      process.stderr.write(`[DEBUG ${label}]\n${truncated}\n`);
    }
  }

  getLines(): string[] {
    return this.lines;
  }

  async saveToFile(filePath: string): Promise<void> {
    await fs.writeFile(filePath, this.lines.join('\n'), 'utf-8');
  }
}
