import { Logger, LogLevel } from "homebridge";

export namespace CustomLogging {
    export const logLevelNumeric: Record<LogLevel, number> = {
        [LogLevel.DEBUG]: 1,
        [LogLevel.INFO]: 2,
        [LogLevel.SUCCESS]: 3,
        [LogLevel.WARN]: 4,
        [LogLevel.ERROR]: 5,
    };

    export const logLevelFromString: Record<string, LogLevel> = {
        ["debug"]: LogLevel.DEBUG,
        ["info"]: LogLevel.INFO,
        ["success"]: LogLevel.SUCCESS,
        ["warn"]: LogLevel.WARN,
        ["error"]: LogLevel.ERROR,
    };

    export class ConsoleLogger {

        public readonly prefix: string;
        public readonly logLevel: number;
        public readonly hasPrefix: boolean;

        constructor(logLevel: LogLevel, prefix?: string) {
            if (prefix) {
                this.prefix = prefix;
                this.hasPrefix = true;
            } else {
                this.prefix = "";
                this.hasPrefix = false;
            }

            this.logLevel = logLevelNumeric[logLevel];
        }

        log(level: LogLevel, message: string, ...parameters: any[]): void {
            if (this.logLevel <= logLevelNumeric[level]) {
                const fullMessage = this.hasPrefix ? `[${this.prefix}] ${message}` : message;
                console.log(fullMessage, ...parameters);
            }
        }

        debug(message: string, ...parameters: any[]): void {
            this.log(LogLevel.DEBUG, message, ...parameters);
        }

        info(message: string, ...parameters: any[]): void {
            this.log(LogLevel.INFO, message, ...parameters);
        }

        success(message: string, ...parameters: any[]): void {
            this.log(LogLevel.SUCCESS, message, ...parameters);
        }

        warn(message: string, ...parameters: any[]): void {
            this.log(LogLevel.WARN, message, ...parameters);
        }

        error(message: string, ...parameters: any[]): void {
            this.log(LogLevel.ERROR, message, ...parameters);
        }
    }

    export class LoggerPrefixWrapper {
        private readonly logger: Logger;
        public readonly prefix: string | undefined;
        public readonly additionalPrefix: string;

        constructor(logger: Logger, additionalPrefix: string) {
            this.logger = logger;
            this.prefix = logger.prefix;
            this.additionalPrefix = additionalPrefix;
        }

        log(level: LogLevel, message: string, ...parameters: any[]): void {
            const fullMessage = `[${this.additionalPrefix}] ${message}`;
            this.logger.log(level, fullMessage, ...parameters);
        }

        debug(message: string, ...parameters: any[]): void {
            const fullMessage = `[${this.additionalPrefix}] ${message}`;
            this.logger.debug(fullMessage, ...parameters);
        }

        info(message: string, ...parameters: any[]): void {
            const fullMessage = `[${this.additionalPrefix}] ${message}`;
            this.logger.info(fullMessage, ...parameters);
        }

        success(message: string, ...parameters: any[]): void {
            const fullMessage = `[${this.additionalPrefix}] ${message}`;
            this.logger.success(fullMessage, ...parameters);
        }

        warn(message: string, ...parameters: any[]): void {
            const fullMessage = `[${this.additionalPrefix}] ${message}`;
            this.logger.warn(fullMessage, ...parameters);
        }

        error(message: string, ...parameters: any[]): void {
            const fullMessage = `[${this.additionalPrefix}] ${message}`;
            this.logger.error(fullMessage, ...parameters);
        }
    }
}

