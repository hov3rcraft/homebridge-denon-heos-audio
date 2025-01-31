import { Telnet } from 'telnet-client';
import { Mutex } from 'async-mutex';
import * as net from 'net';

export enum DenonTelnetMode {
    AVRCONTROL = 23,
    HEOSCLI = 1255,
    HYBRID = -1
}

export enum Playing {
    PLAY,
    PAUSE,
    STOP
}

export const IS_PLAYING: Record<Playing, boolean> = {
    [Playing.PLAY]: true,
    [Playing.PAUSE]: false,
    [Playing.STOP]: false
};

interface IDenonTelnetClientConnectionParams {
    readonly host: string;
    readonly port: number;
    readonly timeout: number;
    readonly negotiationMandatory: boolean;
    readonly irs: string;
    readonly ors: string;
    readonly echoLines: number;
}

export interface IDenonTelnetClient {
    readonly mode: DenonTelnetMode;
    readonly serialNumber: string;

    isConnected(): boolean;
    getPower(): Promise<boolean>;
    setPower(power: boolean): Promise<boolean>;
}

export abstract class DenonTelnetClient implements IDenonTelnetClient {
    public readonly serialNumber: string;
    public readonly params;
    protected readonly irsRegex;
    private connection;
    protected connected;
    public abstract readonly mode: DenonTelnetMode;
    private mutex;

    protected powerUpdateCallback;
    protected debugLogCallback;

    constructor(serialNumber: string, params: IDenonTelnetClientConnectionParams, powerUpdateCallback?: (power: boolean) => void, debugLogCallback?: (message: string, ...parameters: any[]) => void) {
        this.serialNumber = serialNumber;
        this.params = params;
        this.irsRegex = new RegExp(`([^${this.params.irs}]+)`, "g");

        this.connection = new Telnet();
        this.connected = false;
        this.mutex = new Mutex();

        this.powerUpdateCallback = powerUpdateCallback;
        this.debugLogCallback = debugLogCallback;
    }

    protected async connect() {
        this.debugLog('Establishing new connection...');
        this.connection = new Telnet();
        this.connected = false;

        // Listen for connection closure events
        this.connection.on('close', () => {
            this.connected = false;
        });
        this.connection.on('end', () => {
            this.connected = false;
        });
        this.connection.on('error', (error) => {
            this.connected = false;
        });

        // Connect
        try {
            await this.connection.connect(this.params);
            this.connected = true;
            this.debugLog('New connection established.');

            // Listen for responses
            this.connection.on('data', data => {
                let responses = data.toString().match(this.irsRegex) || [""];
                for (const r of responses) {
                    this.debugLog('Received data event:', r);
                    this.genericResponseHandler(r);
                }
            });
        } catch (error) {
            // TODO: connection failed
        }
    }

    protected async send(command: string): Promise<string[]> {
        const release = await this.mutex.acquire();
        try {
            if (!this.connected) {
                await this.connect();
            }
            this.debugLog('Sending command:', command);
            let responses = await this.connection.send(command);
            let responsesSplit = responses.match(this.irsRegex) || [""];
            return responsesSplit;
        } finally {
            release();
        }
    }

    protected abstract genericResponseHandler(response: string): void;

    protected debugLog(message: string, ...parameters: any[]) {
        if (this.debugLogCallback) {
            this.debugLogCallback(message, ...parameters);
        }
    }

    public isConnected(): boolean {
        return this.connected;
    }

    public abstract getPower(): Promise<boolean>;

    public abstract setPower(power: boolean): Promise<boolean>;

    private static checkTelnetAtPort(host: string, port: number): Promise<boolean> {
        return new Promise((resolve, reject) => {
            const socket = net.connect(port, host, () => {
                // If the connection is successful
                socket.end(); // Close the connection
                resolve(true); // Telnet is supported
            });

            socket.on('error', (err) => {
                resolve(false); // Telnet is not supported or some error occurred
            });

            socket.on('timeout', () => {
                socket.end(); // Close the connection
                resolve(false); // Telnet is not supported
            });

            socket.setTimeout(5000); // Set timeout to 5 seconds
        });
    }

    public static async checkTelnetSupport(host: string): Promise<DenonTelnetMode[]> {
        let supportedModes = [];
        for (const mode of Object.values(DenonTelnetMode).filter(value => typeof value === 'number')) {
            if (mode >= 0) {
                let supported = await DenonTelnetClient.checkTelnetAtPort(host, mode);
                if (supported) {
                    supportedModes.push(mode);
                }
            }
        }
        return supportedModes;
    }
}

export class InvalidResponseException extends Error {
    public expectedResponses?: string[];
    public actualResponse?: string;

    constructor(message: string, expectedResponses?: string[], actualResponse?: string) {
        super(InvalidResponseException.buildFullMessage(message, expectedResponses, actualResponse)); // Pass the message to the parent Error class
        this.name = 'InvalidResponseException'; // Set the error name
        this.expectedResponses = expectedResponses;
        this.actualResponse = actualResponse;

        // Ensure the prototype chain is correctly set for instanceof checks
        Object.setPrototypeOf(this, InvalidResponseException.prototype);
    }

    private static buildFullMessage(message: string, expectedResponses?: string[], actualResponse?: string): string {
        let fullMessage = message
        //let fullMessage = message;
        if (expectedResponses) {
            if (actualResponse) {
                fullMessage += ` (Actual response: ${JSON.stringify(actualResponse)}; Expected responses: ${expectedResponses.join(' | ')})`;
            } else {
                fullMessage += ` (Expected response: ${expectedResponses.join(' | ')})`;
            }
        } else if (actualResponse) {
            fullMessage += ` (Actual response: ${actualResponse})`;
        }
        return fullMessage;
    }
}

export class ConnectionTimeoutException extends Error {

    constructor(params: any) {
        super(`connection to ${params.host}:${params.port} timed out after ${params.timeout}ms.`); // Pass the message to the parent Error class
        this.name = 'ConnectionTimeoutException'; // Set the error name

        // Ensure the prototype chain is correctly set for instanceof checks
        Object.setPrototypeOf(this, InvalidResponseException.prototype);
    }
}
