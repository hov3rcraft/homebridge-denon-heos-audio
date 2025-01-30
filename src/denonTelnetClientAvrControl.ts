import { DenonTelnetClient, DenonTelnetMode, InvalidResponseException } from "./denonTelnetClient.js";

export class DenonTelnetClientAvrControl extends DenonTelnetClient {
    constructor(host: string, timeout: number = 1500, powerUpdateCallback?: (power: boolean) => void, debugLogCallback?: (message: string, ...parameters: any[]) => void) {
        super(host, DenonTelnetMode.AVRCONTROL, timeout, powerUpdateCallback, debugLogCallback);
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

    protected genericResponseHandler(response: string) {
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
}
