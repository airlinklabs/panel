import logger from './logger';

class Queueer {
  private queue: (() => Promise<void>)[] = [];
  private isProcessing = false;

  addTask(task: () => Promise<void>): void {
    this.queue.push(task);
    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  private async processQueue(): Promise<void> {
    if (this.queue.length === 0) {
      this.isProcessing = false;
      return;
    }

    this.isProcessing = true;
    const task = this.queue.shift();

    try {
      if (task) {
        await task();
      }
    } catch (error) {
      logger.error('Error processing queue task:', error);
    } finally {
      // Process next task
      this.processQueue();
    }
  }
}

export const queueer = new Queueer();
