import { Logger } from '../logger';

let shuttingDown = false;
let sigintCount = 0;

export function setupGracefulShutdown(logger: Logger): void {
  process.on('SIGINT', () => {
    sigintCount++;
    if (sigintCount >= 2) {
      logger.log('\nForce quit.');
      process.exit(1);
    }
    shuttingDown = true;
    logger.log('\nFinishing current operation... press Ctrl+C again to force quit.');
  });
}

export function isShuttingDown(): boolean {
  return shuttingDown;
}

export function resetShutdown(): void {
  shuttingDown = false;
  sigintCount = 0;
}
