import { DenonTelnetClient, DenonTelnetMode, InvalidResponseException } from "./denonTelnetClient.js";

export class DenonTelnetClientAvrControl extends DenonTelnetClient {

    public readonly mode = DenonTelnetMode.AVRCONTROL;

    protected static readonly COMMANDS = {
        POWER: {
            ON: 'PWON',
            OFF: 'PWSTANDBY',
            QUERY: 'PW?'
        }
    }

    protected static readonly RESPONSES = {
        POWER: {
            ON: 'PWON',
            OFF: 'PWSTANDBY'
        }
    }

    constructor(host: string, timeout: number = 1500, powerUpdateCallback?: (power: boolean) => void, debugLogCallback?: (message: string, ...parameters: any[]) => void) {
        super(host, DenonTelnetMode.AVRCONTROL, timeout, powerUpdateCallback, debugLogCallback);
    }

    protected genericResponseHandler(response: string) {
        switch (response) {
            case DenonTelnetClientAvrControl.RESPONSES.POWER.ON:
                if (this.powerUpdateCallback) {
                    this.powerUpdateCallback(true);
                }
                break;
            case DenonTelnetClientAvrControl.RESPONSES.POWER.OFF:
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
            if (r === DenonTelnetClientAvrControl.RESPONSES.POWER.ON) {
                return true;
            } else if (r === DenonTelnetClientAvrControl.RESPONSES.POWER.OFF) {
                return false;
            }
        }
        throw new InvalidResponseException('Invalid response for power status', Object.values(DenonTelnetClientAvrControl.RESPONSES.POWER), responses[responses.length - 1]);
    }

    public getPower(): Promise<boolean> {
        return this.powerCommand(DenonTelnetClientAvrControl.COMMANDS.POWER.QUERY);
    }

    public setPower(power: boolean): Promise<boolean> {
        const command = power ? DenonTelnetClientAvrControl.COMMANDS.POWER.ON : DenonTelnetClientAvrControl.COMMANDS.POWER.OFF;
        return this.powerCommand(command);
    }
}
