import { Mutex } from "async-mutex";
import * as net from "net";

interface IDenonClientConnectionParams {
  readonly host: string;
  readonly port: number;
  readonly connect_timeout: number;
  readonly response_timeout: number;
  readonly command_prefix: string | undefined;
  readonly command_separator: string;
  readonly response_separator: string;
  readonly all_responses_to_generic: boolean;
}

export interface IDenonClient {
  readonly serialNumber: string;

  isConnected(): boolean;
  getPower(raceStatus?: RaceStatus): Promise<boolean>;
  setPower(power: boolean): Promise<boolean>;
}

export abstract class DenonClient implements IDenonClient {
  public readonly serialNumber: string;
  public readonly params;
  private socket: net.Socket | undefined;
  private sendMutex;
  private dataEventMutex;
  private pendingData: string;
  protected responseCallback: ResponseCallback | undefined;

  protected powerUpdateCallback;
  protected debugLogCallback;

  constructor(
    serialNumber: string,
    params: IDenonClientConnectionParams,
    powerUpdateCallback?: (power: boolean) => void,
    debugLogCallback?: (message: string, ...parameters: any[]) => void
  ) {
    this.serialNumber = serialNumber;
    this.params = params;

    this.socket = undefined;
    this.sendMutex = new Mutex();
    this.dataEventMutex = new Mutex();
    this.pendingData = "";
    this.responseCallback = undefined;

    this.powerUpdateCallback = powerUpdateCallback;
    this.debugLogCallback = debugLogCallback;
  }

  protected async connect(): Promise<void> {
    const release = await this.sendMutex.acquire();
    try {
      if (!this.isConnected()) {
        await this.connectUnchecked();
      }
      return;
    } finally {
      release();
    }
  }

  protected async connectUnchecked(): Promise<void> {
    // Connect
    let newSocket: net.Socket | undefined = undefined;
    try {
      this.debugLog("Establishing new connection...");
      this.pendingData = "";
      this.responseCallback = undefined;
      newSocket = await new Promise<net.Socket>((resolve, reject) => {
        newSocket = net.createConnection(
          {
            host: this.params.host,
            port: this.params.port,
            timeout: 0, // no timeout
          },
          () => {
            this.debugLog("New connection established.");
            resolve(newSocket!);
          }
        );

        // Listen for connection closure events
        newSocket.on("timeout", () => {
          // TODO - right now we do not have client-side timeouts
          this.socket = undefined;
        });
        newSocket.on("close", () => {
          this.debugLog("Connection has closed.");
          newSocket?.destroy();
          this.socket = undefined;
        });
        newSocket.on("error", (error) => {
          this.debugLog("Received an error from the server.", error);
          newSocket?.end();
          setTimeout(() => {
            // give the server 2 seconds to gracefully close the connection, then force the issue
            if (!newSocket?.destroyed) {
              this.debugLog("Connection destroyed.");
              newSocket?.destroy();
            }
          }, 2000);
          this.socket = undefined;
          reject(error);
        });

        // Listen for responses
        newSocket.on("data", (data) => {
          this.dataHandler(data);
        });

        setTimeout(() => {
          reject(new ConnectionTimeoutException(this.params));
        }, this.params.connect_timeout);
      });
      this.socket = newSocket;

      await this.subscribeToChangeEvents();
    } catch (error) {
      if (newSocket) {
        this.debugLog("Destroying socket.");
        newSocket!.destroy(); // Destroy the connection attempt
      }
      this.debugLog("Catching and throwing:", error);
      throw error;
    }
  }

  protected abstract subscribeToChangeEvents(): Promise<void>;

  protected async sendCommand(
    command: any,
    commandMode: CommandMode,
    { pid, value, passPayload = false }: { value?: string; pid?: number; passPayload?: boolean }
  ): Promise<string> {
    const specCommand = command[CommandMode[commandMode]];
    let commandStr = specCommand.COMMAND + specCommand.PARAMS;
    if (pid) {
      commandStr = commandStr.replace("[PID]", pid);
    }
    if (value) {
      commandStr = commandStr.replace("[VALUE]", value);
    }

    if (specCommand.EXP_RES) {
      const response = await this.send(commandStr, specCommand.COMMAND, specCommand.EXP_RES, passPayload);
      if (command.VALUES && !(response in command.VALUES)) {
        throw new InvalidResponseException(`Unexpected response for command ${commandStr}`, command.VALUES, response);
      } else {
        return response;
      }
    } else {
      return await this.send(commandStr, specCommand.COMMAND, undefined, passPayload);
    }
  }

  protected async send(command: string, rawCommand?: string, expectedResponse?: RegExp, passPayload: boolean = false): Promise<string> {
    const release = await this.sendMutex.acquire();
    try {
      if (!this.isConnected()) {
        await this.connectUnchecked();
      }
      return await this.sendUnchecked(command, rawCommand, expectedResponse, passPayload);
    } finally {
      release();
    }
  }

  protected async sendUnchecked(command: string, rawCommand?: string, expectedResponse?: RegExp, passPayload: boolean = false): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const fullCommand = this.params.command_prefix ? this.params.command_prefix + command : command;
      this.debugLog("Sending command:", fullCommand);
      this.responseCallback = new ResponseCallback(
        (response) => {
          resolve(response);
        },
        rawCommand ?? command,
        expectedResponse,
        passPayload
      );
      this.socket!.write(fullCommand + this.params.command_separator);
      setTimeout(() => {
        reject(new ResponseTimeoutException(fullCommand, this.params.response_timeout));
      }, this.params.response_timeout);
    }).finally(() => {
      this.responseCallback = undefined;
    });
  }

  private async dataHandler(incomingData: any) {
    const release = await this.dataEventMutex.acquire();
    let chunks;
    try {
      const currentData: string = this.pendingData ? this.pendingData + incomingData.toString() : incomingData.toString();
      chunks = currentData.split(this.params.response_separator);
      this.pendingData = chunks[chunks.length - 1];
    } finally {
      release();
    }
    for (let i = 0; i <= chunks.length - 2; i++) {
      this.responseRouter(chunks[i]);
    }
  }

  protected abstract responseRouter(response: string): void;

  protected debugLog(message: string, ...parameters: any[]) {
    if (this.debugLogCallback) {
      this.debugLogCallback(message, ...parameters);
    }
  }

  public isConnected(): boolean {
    return this.socket !== undefined;
  }

  public abstract getPower(raceStatus?: RaceStatus): Promise<boolean>;

  public abstract setPower(power: boolean): Promise<boolean>;
}

export enum CommandMode {
  GET,
  SET,
}

class ResponseCallback {
  public readonly callback: (response: string) => void;
  public readonly command: string;
  public readonly expectedResponse: RegExp | undefined;
  public readonly passPayload: boolean;

  constructor(callback: (response: string) => void, command: string, expectedResponse?: RegExp, passPayload = false) {
    this.callback = callback;
    this.command = command;
    this.expectedResponse = expectedResponse;
    this.passPayload = passPayload;
  }
}

export class RaceStatus {
  private static readonly ID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

  private running = true;
  public readonly raceId = RaceStatus.ID_CHARS[Math.floor(Math.random() * 36)] + RaceStatus.ID_CHARS[Math.floor(Math.random() * 36)];

  public isRunning(): boolean {
    return this.running;
  }

  public setRaceOver() {
    this.running = false;
  }
}

export class ConnectionTimeoutException extends Error {
  constructor(params: IDenonClientConnectionParams) {
    super(`connection to ${params.host}:${params.port} timed out after ${params.connect_timeout}ms.`); // Pass the message to the parent Error class
    this.name = "ConnectionTimeoutException"; // Set the error name

    // Ensure the prototype chain is correctly set for instanceof checks
    Object.setPrototypeOf(this, ConnectionTimeoutException.prototype);
  }
}

export class ResponseTimeoutException extends Error {
  constructor(command: string, timeout: number) {
    super(`response for command '${command}' timed out after ${timeout}ms.`); // Pass the message to the parent Error class
    this.name = "ResponseTimeoutException"; // Set the error name

    // Ensure the prototype chain is correctly set for instanceof checks
    Object.setPrototypeOf(this, ResponseTimeoutException.prototype);
  }
}

export class CommandFailedException extends Error {
  constructor(command: string) {
    super(`Execution of command "${command}" has failed on the server side.`); // Pass the message to the parent Error class
    this.name = "CommandFailedException"; // Set the error name

    // Ensure the prototype chain is correctly set for instanceof checks
    Object.setPrototypeOf(this, CommandFailedException.prototype);
  }
}

export class InvalidResponseException extends Error {
  public expectedResponses?: string[];
  public actualResponse?: string;

  constructor(message: string, expectedResponses?: string[], actualResponse?: string) {
    super(InvalidResponseException.buildFullMessage(message, expectedResponses, actualResponse)); // Pass the message to the parent Error class
    this.name = "InvalidResponseException"; // Set the error name
    this.expectedResponses = expectedResponses;
    this.actualResponse = actualResponse;

    // Ensure the prototype chain is correctly set for instanceof checks
    Object.setPrototypeOf(this, InvalidResponseException.prototype);
  }

  private static buildFullMessage(message: string, expectedResponses?: string[], actualResponse?: string): string {
    let fullMessage = message;
    //let fullMessage = message;
    if (expectedResponses) {
      if (actualResponse) {
        fullMessage += ` (Actual response: ${JSON.stringify(actualResponse)}; Expected responses: ${expectedResponses.join(" | ")})`;
      } else {
        fullMessage += ` (Expected response: ${expectedResponses.join(" | ")})`;
      }
    } else if (actualResponse) {
      fullMessage += ` (Actual response: ${actualResponse})`;
    }
    return fullMessage;
  }
}
