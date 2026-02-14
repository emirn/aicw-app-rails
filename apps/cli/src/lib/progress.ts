/**
 * Progress output utilities
 * All progress output goes to stderr to keep stdout clean for JSON
 */

export class Progress {
  private currentLine = '';
  private startTime = 0;

  /**
   * Start tracking time for an operation
   */
  start(): void {
    this.startTime = Date.now();
  }

  /**
   * Get elapsed time in seconds
   */
  elapsed(): number {
    return (Date.now() - this.startTime) / 1000;
  }

  /**
   * Clear current line and write new content
   */
  private clearLine(): void {
    if (process.stderr.isTTY) {
      process.stderr.write('\r' + ' '.repeat(this.currentLine.length) + '\r');
    }
  }

  /**
   * Write progress inline (overwrites current line in TTY)
   */
  inline(message: string): void {
    this.clearLine();
    this.currentLine = message;
    process.stderr.write(message);
  }

  /**
   * Write a line and move to next line
   */
  line(message: string): void {
    this.clearLine();
    this.currentLine = '';
    process.stderr.write(message + '\n');
  }

  /**
   * Show article progress header
   */
  articleStart(index: number, total: number, title: string): void {
    this.line('');
    this.line(`Article ${index}/${total}: "${title}"`);
    this.start();
  }

  /**
   * Show step progress (inline update)
   */
  stepProgress(stepNum: number, totalActions: number, stepName: string): void {
    this.inline(`  Action ${stepNum}/${totalActions}: ${stepName}...`);
    this.start();
  }

  /**
   * Mark step as complete
   */
  stepComplete(stepNum: number, totalActions: number, stepName: string, tokens?: number, cost?: number): void {
    const time = this.elapsed().toFixed(1);
    let suffix = `(${time}s)`;

    if (tokens) {
      suffix = `(${time}s, ${tokens} tokens)`;
    }
    if (cost !== undefined) {
      suffix = `(${time}s, $${cost.toFixed(4)})`;
    }

    this.line(`  Action ${stepNum}/${totalActions}: ${stepName} done ${suffix}`);
  }

  /**
   * Mark step as failed
   */
  stepFailed(stepNum: number, totalActions: number, stepName: string, error: string): void {
    this.line(`  Action ${stepNum}/${totalActions}: ${stepName} FAILED`);
    this.line(`    Error: ${error}`);
  }

  /**
   * Show article complete
   */
  articleComplete(articlePath: string): void {
    const time = this.elapsed().toFixed(1);
    this.line(`  Completed: ${articlePath} (${time}s total)`);
  }

  /**
   * Show generation summary to stderr (human-readable)
   */
  summary(stats: {
    articles: number;
    totalTime: number;
    totalTokens: number;
    totalCost: number;
    outputPath: string;
  }): void {
    this.line('');
    this.line('─'.repeat(50));
    this.line('Generation Summary:');
    this.line(`  Articles: ${stats.articles}`);
    this.line(`  Time: ${stats.totalTime.toFixed(1)}s`);
    this.line(`  Tokens: ${stats.totalTokens.toLocaleString()}`);
    this.line(`  Cost: $${stats.totalCost.toFixed(4)}`);
    if (stats.articles > 0) {
      this.line(`  Avg/article: $${(stats.totalCost / stats.articles).toFixed(4)}`);
    }
    this.line(`  Output: ${stats.outputPath}`);
    this.line('─'.repeat(50));
  }

  /**
   * Show cache status
   */
  cacheHit(type: string, itemCount: number, age?: string): void {
    const ageStr = age ? ` (${age} old)` : '';
    this.line(`Using cached ${type}${ageStr}: ${itemCount} items`);
  }

  /**
   * Show resume status
   */
  resuming(articleIndex: number, stepIndex: number, title: string): void {
    this.line(`Resuming article ${articleIndex}: "${title}" from step ${stepIndex}`);
  }
}

/**
 * Format duration in human-readable form
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}m ${secs}s`;
}

/**
 * Format age from timestamp
 */
export function formatAge(timestamp: string | number): string {
  const ms = typeof timestamp === 'string'
    ? Date.now() - new Date(timestamp).getTime()
    : Date.now() - timestamp;

  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
