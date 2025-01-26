import { Telnet } from 'telnet-client';
import { Mutex } from 'async-mutex';


export class DenonTelnetClient {
    private static readonly COMMANDS = {
        POWER: {
            ON: 'PWON',
            OFF: 'PWSTANDBY',
            QUERY: 'PW?'
        }
    }

    private static readonly RESPONSES = {
        POWER: {
            ON: 'PWON',
            OFF: 'PWSTANDBY'
        }
    }

    private readonly params;
    private connection;
    private isConnected;
    private mutex;

    private powerUpdateCallback;
    private debugLogCallback;

    constructor(host: string, port: number = 23, timeout: number = 1500, powerUpdateCallback?: (power: boolean) => void, debugLogCallback?: (message: string, ...parameters: any[]) => void) {
        this.params = {
            host: host,
            port: port,
            timeout: timeout,
            negotiationMandatory: false,
            irs: '\r',
            ors: '\r',
            echoLines: 0,
        };

        this.connection = new Telnet();
        this.isConnected = false;
        this.mutex = new Mutex();

        this.powerUpdateCallback = powerUpdateCallback;
        this.debugLogCallback = debugLogCallback;
    }

    private async connect() {
        this.debugLog('Establishing new connection...');
        this.connection = new Telnet();
        this.isConnected = false;

        // Listen for connection closure events
        this.connection.on('close', () => {
            this.isConnected = false;
        });
        this.connection.on('end', () => {
            this.isConnected = false;
        });
        this.connection.on('error', (error) => {
            this.isConnected = false;
        });

        // Listen for responses
        this.connection.on('data', data => {
            let responses = data.toString().match(/([^\r]+)/g) || [""];
            for (const r of responses) {
                this.debugLog('Received response:', JSON.stringify(r));
                this.genericResponseHandler(r);
            }
        });

        // Connect
        try {
            await this.connection.connect(this.params);
            this.isConnected = true;
            this.debugLog('New connection established.');
        } catch (error) {
            // timeout
        }
    }

    private async send(command: string): Promise<string[]> {
        const release = await this.mutex.acquire();
        try {
            if (!this.isConnected) {
                await this.connect();
            }
            this.debugLog('Sending command:', command);
            let responses = await this.connection.send(command);
            let responsesSplit = responses.match(/([^\r]+)/g) || [""];;
            return responsesSplit;
        } finally {
            release();
        }
    }

    private async powerCommand(command: string): Promise<boolean> {
        const responses = await this.send(command);

        for (let i = responses.length - 1; i >= 0; i--) {
            let r = responses[i];
            if (r === DenonTelnetClient.RESPONSES.POWER.ON) {
                return true;
            } else if (r === DenonTelnetClient.RESPONSES.POWER.OFF) {
                return false;
            }
        }
        throw new InvalidResponseException('Invalid response for power status', Object.values(DenonTelnetClient.RESPONSES.POWER), responses[responses.length - 1]);
    }

    getPower(): Promise<boolean> {
        return this.powerCommand(DenonTelnetClient.COMMANDS.POWER.QUERY);
    }

    setPower(power: boolean): Promise<boolean> {
        const command = power ? DenonTelnetClient.COMMANDS.POWER.ON : DenonTelnetClient.COMMANDS.POWER.OFF;
        return this.powerCommand(command);
    }

    private genericResponseHandler(response: string) {
        switch (response) {
            case DenonTelnetClient.RESPONSES.POWER.ON:
                if (this.powerUpdateCallback) {
                    this.powerUpdateCallback(true);
                }
                break;
            case DenonTelnetClient.RESPONSES.POWER.OFF:
                if (this.powerUpdateCallback) {
                    this.powerUpdateCallback(false);
                }
                break;
            default:
                break;
        }
    }

    private debugLog(message: string, ...parameters: any[]) {
        if (this.debugLogCallback) {
            this.debugLogCallback(message, ...parameters);
        }
    }
}

class InvalidResponseException extends Error {
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

class ConnectionTimeoutException extends Error {

    constructor(params: any) {
        super(`connection to ${params.host}:${params.port} timed out after ${params.timeout}ms.`); // Pass the message to the parent Error class
        this.name = 'ConnectionTimeoutException'; // Set the error name

        // Ensure the prototype chain is correctly set for instanceof checks
        Object.setPrototypeOf(this, InvalidResponseException.prototype);
    }
}

// https://hometheaterreviewpro.com/how-to-control-your-denon-receiver-with-a-computer/#AVR_Control_Protocol
