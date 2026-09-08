import { getSettings } from "./settingsCache";
import logger from "./logger";
import prisma from "../db";
import { logT } from "../services/i18n";

export const settingsLoader = async () => {
  try {
    const settings = await getSettings();

    if (!settings) {
      await prisma.settings.create({
        data: {
          title: "AirLink",
          description:
            "AirLink is a free and open source project by AirlinkLabs",
          logo: "../assets/logo.png",
          theme: "default",
          language: "en",
          allowRegistration: false,
          uploadLimit: 100,
          rateLimitEnabled: true,
          rateLimitRpm: 500,
          bannedIps: "[]",
          allowUserCreateServer: false,
          allowUserDeleteServer: false,
          defaultServerLimit: 0,
          defaultMaxMemory: 512,
          defaultMaxCpu: 100,
          defaultMaxStorage: 5120,
          defaultMaxDatabases: 0,
          defaultOverallocateMemory: 0,
          defaultOverallocateDisk: 0,
          defaultOverallocateCpu: 0,
          loginMaxAttempts: 5,
          loginLockoutMinutes: 15,
          enforceDaemonHttps: false,
          behindReverseProxy: false,
          hashApiKeys: false,
        },
      });
      logger.info(logT("log.settingsCreated"));
    }

    return prisma;
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    logger.error(logT("log.dbConnectionError", { message }));
    throw error;
  }
};
