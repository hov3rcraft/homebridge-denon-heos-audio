import { LogLevel } from "homebridge";

export class ConsoleLogger {
    private static logLevelNumeric: Record<LogLevel, number> = {
        [LogLevel.DEBUG]: 1,
        [LogLevel.INFO]: 2,
        [LogLevel.SUCCESS]: 3,
        [LogLevel.WARN]: 4,
        [LogLevel.ERROR]: 5,
    };

    public static logLevelFromString: Record<string, LogLevel> = {
        ["debug"]: LogLevel.DEBUG,
        ["info"]: LogLevel.INFO,
        ["success"]: LogLevel.SUCCESS,
        ["warn"]: LogLevel.WARN,
        ["error"]: LogLevel.ERROR,
    };

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

        this.logLevel = ConsoleLogger.logLevelNumeric[logLevel];
    }

    log(level: LogLevel, message: string, ...parameters: any[]): void {
        if (this.logLevel <= ConsoleLogger.logLevelNumeric[level]) {
            const fullMessage = (this.hasPrefix) ? message : this.prefix + " " + message;
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