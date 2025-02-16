type Task = {
  fn: () => void;
  time: number;
};

class QueueHandler {
  private queue: Task[] = [];
  private isProcessing: boolean = false;

  addTask(fn: () => void, time: number): void {
    this.queue.push({ fn, time });
    this.processQueue();
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;

    this.isProcessing = true;

    while (this.queue.length > 0) {
      const { fn, time } = this.queue.shift()!;

      await this.delay(time);
      fn();
    }

    this.isProcessing = false;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export default QueueHandler;
