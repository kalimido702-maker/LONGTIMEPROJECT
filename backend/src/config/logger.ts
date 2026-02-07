import pino from "pino";
import { env } from "./env.js";
import path from "path";
import fs from "fs";

// Create logs directory if it doesn't exist
if (!fs.existsSync(env.LOG_FILE_PATH)) {
  fs.mkdirSync(env.LOG_FILE_PATH, { recursive: true });
}

const isDevelopment = env.NODE_ENV === "development";

// Production config without formatters (not allowed with transport.targets)
const productionConfig = {
  level: env.LOG_LEVEL,
  transport: {
    targets: [
      // Console output
      {
        target: "pino/file",
        options: { destination: 1 }, // stdout
      },
      // Daily rotation file
      {
        target: "pino/file",
        options: {
          destination: path.join(
            env.LOG_FILE_PATH,
            `app-${new Date().toISOString().split("T")[0]}.log`
          ),
        },
      },
    ],
  },
  timestamp: pino.stdTimeFunctions.isoTime,
};

// Development config with pretty printing and formatters
const developmentConfig = {
  level: env.LOG_LEVEL,
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "HH:MM:ss Z",
      ignore: "pid,hostname",
    },
  },
  formatters: {
    level: (label: string) => {
      return { level: label.toUpperCase() };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
};

export const logger = pino(isDevelopment ? developmentConfig : productionConfig);

export default logger;
