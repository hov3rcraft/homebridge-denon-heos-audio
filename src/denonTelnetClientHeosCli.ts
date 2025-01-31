import { DenonTelnetClient, DenonTelnetMode, InvalidResponseException } from "./denonTelnetClient.js";

export class DenonTelnetClientHeosCli extends DenonTelnetClient {

    public readonly mode = DenonTelnetMode.HEOSCLI;

    constructor(host: string, timeout: number = 1500, debugLogCallback?: (message: string, ...parameters: any[]) => void) {
        super(host, DenonTelnetMode.HEOSCLI, timeout, undefined, debugLogCallback);
    }

    protected genericResponseHandler(response: string) {

    }

    public getPower(): Promise<boolean> {
        throw new Error("Method not implemented.");
    }

    public setPower(power: boolean): Promise<boolean> {
        throw new Error("Method not implemented.");
    }
}