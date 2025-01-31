import { IDenonTelnetClient, DenonTelnetMode } from "./denonTelnetClient.js";
import { DenonTelnetClientAvrControl } from "./denonTelnetClientAvrControl.js";
import { DenonTelnetClientHeosCli } from "./denonTelnetClientHeosCli.js";

export class DenonTelnetClientHybrid implements IDenonTelnetClient {

    public readonly mode = DenonTelnetMode.HYBRID;

    private readonly telnetClientAvrControl;
    private readonly telnetClientHeosCli;

    constructor(host: string, timeout: number = 1500, powerUpdateCallback?: (power: boolean) => void, debugLogCallback?: (message: string, ...parameters: any[]) => void) {
        this.telnetClientAvrControl = new DenonTelnetClientAvrControl(host, timeout, powerUpdateCallback, debugLogCallback);
        this.telnetClientHeosCli = new DenonTelnetClientHeosCli(host, timeout, debugLogCallback);
    }

    public isConnected(): boolean {
        return this.telnetClientAvrControl.isConnected() || this.telnetClientHeosCli.isConnected();
    }

    public getPower(): Promise<boolean> {
        return this.telnetClientAvrControl.getPower();
    }

    public setPower(power: boolean): Promise<boolean> {
        return this.telnetClientAvrControl.setPower(power);
    }
}