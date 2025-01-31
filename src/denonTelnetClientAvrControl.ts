import { Telnet } from "telnet-client";
import { DenonTelnetClient, DenonTelnetMode, InvalidResponseException } from "./denonTelnetClient.js";

export class DenonTelnetClientAvrControl extends DenonTelnetClient {

    public readonly mode = DenonTelnetMode.AVRCONTROL;

    protected static readonly PROTOCOL = {
        POWER: {
            GET: {
                COMMAND: 'PW?',
                PARAMS: '',
                MESSAGE: /^PW(\w+)$/
            },
            SET: {
                COMMAND: 'PW',
                PARAMS: '[VALUE]',
                MESSAGE: /^PW(\w+)$/
            },
            VALUES: {
                "ON": true,
                "STANDBY": false
            }
        }
    }

    protected static readonly REVERSE_POWER_VALUES = Object.fromEntries(Object.entries(DenonTelnetClientAvrControl.PROTOCOL.POWER.VALUES).map(([key, value]) => [Number(value), key])) as Record<number, string>;

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

        this.connect();
    }

    protected async subscribeToChangeEvents(): Promise<void> {
        // not necessary
    }

    private async sendCommandAndParseResponse(command: any, value?: any): Promise<string> {
        let commandStr = command.COMMAND + command.PARAMS;
        if (value) {
            commandStr = commandStr.replace("[VALUE]", value);
        }

        const responses = await this.send(commandStr);

        for (let i = responses.length - 1; i >= 0; i--) {
            let r = responses[i];

            const captures = r.match(command.MESSAGE);
            if (captures && captures.length === 2) {
                return captures[1];
            }
        }
        throw new InvalidResponseException("No valid response!", command.MESSAGE.source, "");
    }

    protected genericResponseHandler(response: string) {
        this.debugLog('Received data event:', response);

        // Power
        let match = response.match(DenonTelnetClientAvrControl.PROTOCOL.POWER.GET.MESSAGE);
        if (match) {
            if (match[1] in DenonTelnetClientAvrControl.PROTOCOL.POWER.VALUES && this.powerUpdateCallback) {
                this.powerUpdateCallback(DenonTelnetClientAvrControl.PROTOCOL.POWER.VALUES[match[1] as keyof typeof DenonTelnetClientAvrControl.PROTOCOL.POWER.VALUES]);
            } else {
                throw new InvalidResponseException("Unexpected power state", Object.keys(DenonTelnetClientAvrControl.PROTOCOL.POWER.VALUES), match[1]);
            }
        }
    }

    public async getPower(): Promise<boolean> {
        let response = await this.sendCommandAndParseResponse(DenonTelnetClientAvrControl.PROTOCOL.POWER.GET);
        if (response in DenonTelnetClientAvrControl.PROTOCOL.POWER.VALUES) {
            return DenonTelnetClientAvrControl.PROTOCOL.POWER.VALUES[response as keyof typeof DenonTelnetClientAvrControl.PROTOCOL.POWER.VALUES];
        }
        throw new InvalidResponseException("Unexpected power state", Object.keys(DenonTelnetClientAvrControl.PROTOCOL.POWER.VALUES), response);
    }

    public async setPower(power: boolean): Promise<boolean> {
        let response = await this.sendCommandAndParseResponse(DenonTelnetClientAvrControl.PROTOCOL.POWER.SET, DenonTelnetClientAvrControl.REVERSE_POWER_VALUES[Number(power)]);
        if (response in DenonTelnetClientAvrControl.PROTOCOL.POWER.VALUES) {
            return DenonTelnetClientAvrControl.PROTOCOL.POWER.VALUES[response as keyof typeof DenonTelnetClientAvrControl.PROTOCOL.POWER.VALUES];
        }
        throw new InvalidResponseException("Unexpected power state", Object.keys(DenonTelnetClientAvrControl.PROTOCOL.POWER.VALUES), response);
    }
}
