/**
 * JSON output utilities for CLI
 * All CLI output goes through here - enables DRY approach where API responses are passed through directly
 */

/**
 * Output data as JSON to stdout
 */
export function output(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

/**
 * Output error as JSON to stdout and exit
 */
export function outputError(error: string, code?: string): void {
  console.log(JSON.stringify({
    success: false,
    error,
    error_code: code
  }, null, 2));
  process.exit(1);
}

/**
 * Output message to stderr (for warnings/progress that shouldn't interfere with JSON output)
 */
export function outputToStderr(message: string): void {
  console.error(message);
}
