import { DenonTelnetClient, DenonTelnetMode, InvalidResponseException } from "./denonTelnetClient.js";

export class DenonTelnetClientHeosCli extends DenonTelnetClient {
    constructor(host: string, timeout: number = 1500, powerUpdateCallback?: (power: boolean) => void, debugLogCallback?: (message: string, ...parameters: any[]) => void) {
        super(host, DenonTelnetMode.HEOSCLI, timeout, powerUpdateCallback, debugLogCallback);
    }

    protected genericResponseHandler(response: string) {

    }
}