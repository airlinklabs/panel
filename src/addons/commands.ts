import logger from './logger';

export interface RegisteredCommand {
  name: string;
  description: string;
  handler: (args: string[]) => Promise<string> | string;
}

export interface ScheduledTask {
  id: string;
  intervalMs: number;
  handler: () => Promise<void> | void;
}

class AddonCommandRegistry {
  private commands = new Map<string, RegisteredCommand>();
  private addonCommands = new Map<string, string[]>();

  register(addonSlug: string, command: RegisteredCommand): void {
    const key = `${addonSlug}:${command.name}`;
    this.commands.set(key, command);

    const existing = this.addonCommands.get(addonSlug) ?? [];
    if (!existing.includes(command.name)) {
      existing.push(command.name);
      this.addonCommands.set(addonSlug, existing);
    }
  }

  async execute(commandKey: string, args: string[] = []): Promise<string> {
    const cmd = this.commands.get(commandKey);
    if (!cmd) return `Command not found: ${commandKey}`;

    try {
      const result = await cmd.handler(args);
      return result;
    } catch (err: any) {
      logger.error(`Command "${commandKey}" failed:`, err.message);
      return `Command failed: ${err.message}`;
    }
  }

  getAllCommands(): Array<RegisteredCommand & { addonSlug: string; key: string }> {
    const result: Array<RegisteredCommand & { addonSlug: string; key: string }> = [];
    for (const [key, cmd] of this.commands) {
      const addonSlug = key.split(':')[0];
      result.push({ ...cmd, addonSlug, key });
    }
    return result;
  }

  getAddonCommands(addonSlug: string): RegisteredCommand[] {
    const names = this.addonCommands.get(addonSlug) ?? [];
    return names.map(name => this.commands.get(`${addonSlug}:${name}`)).filter(Boolean) as RegisteredCommand[];
  }

  clearAddonCommands(addonSlug: string): void {
    const names = this.addonCommands.get(addonSlug) ?? [];
    for (const name of names) {
      this.commands.delete(`${addonSlug}:${name}`);
    }
    this.addonCommands.delete(addonSlug);
  }
}

class AddonScheduler {
  private timers = new Map<string, ReturnType<typeof setInterval>>();
  private addonTimers = new Map<string, string[]>();

  register(addonSlug: string, task: ScheduledTask): void {
    const key = `${addonSlug}:${task.id}`;

    if (this.timers.has(key)) {
      clearInterval(this.timers.get(key)!);
    }

    const timer = setInterval(async () => {
      try {
        await task.handler();
      } catch (err: any) {
        logger.error(`Scheduled task "${key}" failed:`, err.message);
      }
    }, task.intervalMs);

    this.timers.set(key, timer);

    const existing = this.addonTimers.get(addonSlug) ?? [];
    if (!existing.includes(task.id)) {
      existing.push(task.id);
      this.addonTimers.set(addonSlug, existing);
    }
  }

  clearAddonTimers(addonSlug: string): void {
    const ids = this.addonTimers.get(addonSlug) ?? [];
    for (const id of ids) {
      const key = `${addonSlug}:${id}`;
      const timer = this.timers.get(key);
      if (timer) {
        clearInterval(timer);
        this.timers.delete(key);
      }
    }
    this.addonTimers.delete(addonSlug);
  }

  clearAll(): void {
    for (const [, timer] of this.timers) {
      clearInterval(timer);
    }
    this.timers.clear();
    this.addonTimers.clear();
  }
}

export const commandRegistry = new AddonCommandRegistry();
export const scheduler = new AddonScheduler();
