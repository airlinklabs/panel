import prisma from "../db";
import logger from "../handlers/logger";

export interface LogSystemErrorOpts {
  message: string;
  stack?: string;
  component: string; // "api" | "daemon" | "database" | "redis" | "scheduler"
  severity: "warning" | "error" | "critical";
  metadata?: Record<string, unknown>;
}

export async function logSystemError(error: LogSystemErrorOpts): Promise<void> {
  try {
    await prisma.systemLog.create({
      data: {
        message: error.message,
        stack: error.stack ?? null,
        component: error.component,
        severity: error.severity,
        metadata: error.metadata ? JSON.stringify(error.metadata) : null,
      },
    });
  } catch (err) {
    // system logging must never crash the process
    logger.error("[system-log] failed to write system log", err);
  }
}

export interface GetSystemLogsParams {
  page: number;
  perPage: number;
  severity?: string;
  component?: string;
  startDate?: Date;
  endDate?: Date;
  search?: string;
}

export async function getSystemLogs(params: GetSystemLogsParams) {
  const where: Record<string, unknown> = {};

  if (params.severity) {
    where.severity = params.severity;
  }
  if (params.component) {
    where.component = params.component;
  }
  if (params.search) {
    where.message = { contains: params.search };
  }
  if (params.startDate || params.endDate) {
    where.createdAt = {
      ...(params.startDate ? { gte: params.startDate } : {}),
      ...(params.endDate ? { lte: params.endDate } : {}),
    };
  }

  const [logs, total] = await Promise.all([
    prisma.systemLog.findMany({
      where,
      skip: (params.page - 1) * params.perPage,
      take: params.perPage,
      orderBy: { createdAt: "desc" },
    }),
    prisma.systemLog.count({ where }),
  ]);

  return {
    logs,
    meta: {
      current_page: params.page,
      per_page: params.perPage,
      total,
      last_page: Math.ceil(total / params.perPage) || 1,
    },
  };
}
