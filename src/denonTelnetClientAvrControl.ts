import { Telnet } from "telnet-client";
import { DenonTelnetClient, DenonTelnetMode, InvalidResponseException } from "./denonTelnetClient.js";

export class DenonTelnetClientAvrControl extends DenonTelnetClient {

    public readonly mode = DenonTelnetMode.AVRCONTROL;

    protected static readonly PROTOCOL = {
        POWER: {
            GET: {
                COMMAND: 'PW?',
                PARAMS: '',
                MESSAGE: 'PW[VALUE]'
            },
            SET: {
                COMMAND: 'PW',
                PARAMS: '[VALUE]',
                MESSAGE: 'PW[VALUE]'
            }
        }
    }

    constructor(serialNumber: string, host: string, timeout: number = 1500, powerUpdateCallback?: (power: boolean) => void, debugLogCallback?: (message: string, ...parameters: any[]) => void) {
        super(serialNumber, {
            host: host,
            port: DenonTelnetMode.AVRCONTROL,
            timeout: timeout,
            negotiationMandatory: false,
            irs: '\r',
            ors: '\r\n',
            echoLines: 0,
        }, powerUpdateCallback, debugLogCallback);
    }

    protected async postConnect(connection: Telnet): Promise<void> {
        return;
    }

    protected genericResponseHandler(response: string) {
        switch (response) {
            case "PWON": //TODO
                if (this.powerUpdateCallback) {
                    this.powerUpdateCallback(true);
                }
                break;
            case "PWSTANDBY": // TODO
                if (this.powerUpdateCallback) {
                    this.powerUpdateCallback(false);
                }
                break;
            default:
                break;
        }
    }

    private async powerCommand(command: string): Promise<boolean> {
        const responses = await this.send(command);

        for (let i = responses.length - 1; i >= 0; i--) {
            let r = responses[i];
            if (r === "PWON") { // TODO
                return true;
            } else if (r === "PWSTANDBY") { // TODO
                return false;
            }
        }
        throw new InvalidResponseException('Invalid response for power status', [DenonTelnetClientAvrControl.PROTOCOL.POWER.SET.MESSAGE], responses[responses.length - 1]);
    }

    public getPower(): Promise<boolean> {
        return this.powerCommand("PW?"); // TODO
    }

    public setPower(power: boolean): Promise<boolean> {
        const command = power ? "PWON" : "PWSTANDBY"; // TODO
        return this.powerCommand(command);
    }
}
