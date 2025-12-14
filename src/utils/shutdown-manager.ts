/**
 * Graceful Shutdown Manager
 *
 * Provides a centralized mechanism for registering cleanup handlers
 * and ensuring they are all executed before process exit.
 *
 * Key features:
 * - Prevents multiple shutdown attempts
 * - Enforces timeout on cleanup handlers
 * - Logs shutdown progress
 * - Prevents resource leaks on SIGINT/SIGTERM
 */

import { Logger } from './logger.js';

export interface CleanupHandler {
  name: string;
  handler: () => Promise<void>;
  priority?: number; // Lower numbers run first, default 100
}

class ShutdownManagerImpl {
  private cleanupHandlers: CleanupHandler[] = [];
  private isShuttingDown = false;
  private shutdownPromise: Promise<void> | null = null;
  private readonly defaultTimeout = 5000; // 5 seconds per handler

  /**
   * Register a cleanup handler to be called during shutdown
   * @param name Descriptive name for logging
   * @param handler Async cleanup function
   * @param priority Lower numbers run first (default: 100)
   */
  register(name: string, handler: () => Promise<void>, priority = 100): void {
    if (this.isShuttingDown) {
      Logger.warn(`Cannot register cleanup handler "${name}" - shutdown in progress`);
      return;
    }

    this.cleanupHandlers.push({ name, handler, priority });
    // Sort by priority
    this.cleanupHandlers.sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
  }

  /**
   * Unregister a cleanup handler by name
   */
  unregister(name: string): boolean {
    const index = this.cleanupHandlers.findIndex(h => h.name === name);
    if (index !== -1) {
      this.cleanupHandlers.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Initiate graceful shutdown
   * @param signal The signal that triggered shutdown (e.g., 'SIGINT', 'SIGTERM')
   * @param exitCode Exit code to use (default: 0)
   */
  async shutdown(signal: string, exitCode = 0): Promise<void> {
    // Prevent multiple shutdown attempts - return existing promise if already shutting down
    if (this.isShuttingDown) {
      Logger.info(`Shutdown already in progress (triggered by ${signal})`);
      return this.shutdownPromise!;
    }

    this.isShuttingDown = true;
    Logger.info(`\n🛑 Received ${signal}, starting graceful shutdown...`);

    this.shutdownPromise = this.executeCleanup(exitCode);
    return this.shutdownPromise;
  }

  private async executeCleanup(exitCode: number): Promise<void> {
    const startTime = Date.now();
    const results: { name: string; success: boolean; error?: string; duration: number }[] = [];

    for (const { name, handler } of this.cleanupHandlers) {
      const handlerStart = Date.now();
      try {
        Logger.info(`  ⏳ Cleaning up: ${name}...`);

        // Race between handler and timeout
        await Promise.race([
          handler(),
          new Promise<void>((_, reject) =>
            setTimeout(
              () => reject(new Error(`Timeout after ${this.defaultTimeout}ms`)),
              this.defaultTimeout
            )
          )
        ]);

        const duration = Date.now() - handlerStart;
        results.push({ name, success: true, duration });
        Logger.info(`  ✅ ${name} completed (${duration}ms)`);
      } catch (error) {
        const duration = Date.now() - handlerStart;
        const errorMessage = error instanceof Error ? error.message : String(error);
        results.push({ name, success: false, error: errorMessage, duration });
        Logger.error(`  ❌ ${name} failed: ${errorMessage}`);
      }
    }

    const totalDuration = Date.now() - startTime;
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    Logger.info(`\n📊 Shutdown complete in ${totalDuration}ms`);
    Logger.info(`   ✅ ${successCount} handlers succeeded`);
    if (failCount > 0) {
      Logger.warn(`   ❌ ${failCount} handlers failed`);
    }

    // Give a moment for logs to flush
    await new Promise(resolve => setTimeout(resolve, 100));

    process.exit(exitCode);
  }

  /**
   * Check if shutdown is in progress
   */
  isInProgress(): boolean {
    return this.isShuttingDown;
  }

  /**
   * Get registered handler count
   */
  getHandlerCount(): number {
    return this.cleanupHandlers.length;
  }

  /**
   * Install signal handlers for SIGINT and SIGTERM
   * Should be called once at application startup
   */
  installSignalHandlers(): void {
    const handleSignal = (signal: string) => {
      // Use void to acknowledge we're not awaiting
      void this.shutdown(signal);
    };

    process.on('SIGINT', () => handleSignal('SIGINT'));
    process.on('SIGTERM', () => handleSignal('SIGTERM'));

    // Handle uncaught errors gracefully
    process.on('uncaughtException', (error) => {
      Logger.error('Uncaught exception:', error);
      void this.shutdown('uncaughtException', 1);
    });

    process.on('unhandledRejection', (reason) => {
      Logger.error('Unhandled rejection:', reason);
      void this.shutdown('unhandledRejection', 1);
    });
  }
}

// Export singleton instance
export const shutdownManager = new ShutdownManagerImpl();

// Export class for testing
export { ShutdownManagerImpl };
