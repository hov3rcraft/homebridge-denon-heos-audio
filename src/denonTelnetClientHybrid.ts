import { IDenonTelnetClient, DenonTelnetMode, RaceStatus } from "./denonTelnetClient.js";
import { DenonTelnetClientAvrControl } from "./denonTelnetClientAvrControl.js";
import { DenonTelnetClientHeosCli } from "./denonTelnetClientHeosCli.js";

export class DenonTelnetClientHybrid implements IDenonTelnetClient {

    public readonly mode = DenonTelnetMode.HYBRID;
    public readonly serialNumber: string;

    private readonly telnetClientAvrControl;
    private readonly telnetClientHeosCli;

    constructor(serialNumber: string, host: string, connect_timeout: number, response_timeout: number, powerUpdateCallback?: (power: boolean) => void, debugLogCallback?: (message: string, ...parameters: any[]) => void) {
        this.telnetClientAvrControl = new DenonTelnetClientAvrControl(serialNumber, host, connect_timeout, response_timeout, powerUpdateCallback, debugLogCallback);
        this.telnetClientHeosCli = new DenonTelnetClientHeosCli(serialNumber, host, connect_timeout, response_timeout, powerUpdateCallback, debugLogCallback);
        this.serialNumber = serialNumber;
    }

    public isConnected(): boolean {
        return this.telnetClientAvrControl.isConnected() || this.telnetClientHeosCli.isConnected();
    }

    public getPower(raceStatus?: RaceStatus): Promise<boolean> {
        return this.telnetClientAvrControl.getPower();
    }

    public setPower(power: boolean): Promise<boolean> {
        return this.telnetClientAvrControl.setPower(power);
    }
}