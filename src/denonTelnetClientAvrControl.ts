import { CommandMode, DenonTelnetClient, DenonTelnetMode, InvalidResponseException } from "./denonTelnetClient.js";

export class DenonTelnetClientAvrControl extends DenonTelnetClient {

    public readonly mode = DenonTelnetMode.AVRCONTROL;

    protected static readonly PROTOCOL = {
        POWER: {
            GET: {
                COMMAND: 'PW?',
                PARAMS: '',
                EXP_RES: /^PW(\w+)$/
            },
            SET: {
                COMMAND: 'PW',
                PARAMS: '[VALUE]',
                EXP_RES: /^PW(\w+)$/
            },
            VALUES: {
                "ON": true,
                "STANDBY": false
            }
        }
    }

    protected static readonly REVERSE_POWER_VALUES = Object.fromEntries(Object.entries(DenonTelnetClientAvrControl.PROTOCOL.POWER.VALUES).map(([key, value]) => [Number(value), key])) as Record<number, string>;

    constructor(serialNumber: string, host: string, connect_timeout: number, response_timeout: number, powerUpdateCallback?: (power: boolean) => void, debugLogCallback?: (message: string, ...parameters: any[]) => void) {
        super(serialNumber, {
            host: host,
            port: DenonTelnetMode.AVRCONTROL,
            connect_timeout: connect_timeout,
            response_timeout: response_timeout,
            command_prefix: undefined,
            command_separator: '\r\n',
            response_separator: '\r',
            all_responses_to_generic: false
        }, powerUpdateCallback, debugLogCallback);

        this.connect();
    }

    protected async subscribeToChangeEvents(): Promise<void> {
        // not necessary - change events are automatically sent in AVR control
    }

    protected responseRouter(response: string) {
        if (this.responseCallback) {
            if (this.responseCallback.expectedResponse) {
                let match = response.match(this.responseCallback.expectedResponse);
                if (match) {
                    this.responseCallback.callback(match[1] ?? match[0]);
                    this.responseCallback = undefined;
                    if (!this.params.all_responses_to_generic) {
                        return;
                    }
                }
            } else {
                this.responseCallback.callback(response);
                this.responseCallback = undefined;
                if (!this.params.all_responses_to_generic) {
                    return;
                }
            }
        }

        this.genericResponseHandler(response);
    }

    private genericResponseHandler(response: string) {
        this.debugLog('Received data event:', response);

        // Power
        let match = response.match(DenonTelnetClientAvrControl.PROTOCOL.POWER.GET.EXP_RES);
        if (match) {
            if (match[1] in DenonTelnetClientAvrControl.PROTOCOL.POWER.VALUES && this.powerUpdateCallback) {
                this.powerUpdateCallback(DenonTelnetClientAvrControl.PROTOCOL.POWER.VALUES[match[1] as keyof typeof DenonTelnetClientAvrControl.PROTOCOL.POWER.VALUES]);
            } else {
                throw new InvalidResponseException("Unexpected power state", Object.keys(DenonTelnetClientAvrControl.PROTOCOL.POWER.VALUES), match[1]);
            }
        }
    }

    public async getPower(): Promise<boolean> {
        let response = await this.sendCommand(DenonTelnetClientAvrControl.PROTOCOL.POWER, CommandMode.GET, {});
        return DenonTelnetClientAvrControl.PROTOCOL.POWER.VALUES[response as keyof typeof DenonTelnetClientAvrControl.PROTOCOL.POWER.VALUES];
    }

    public async setPower(power: boolean): Promise<boolean> {
        let response = await this.sendCommand(DenonTelnetClientAvrControl.PROTOCOL.POWER, CommandMode.SET, { value: DenonTelnetClientAvrControl.REVERSE_POWER_VALUES[Number(power)] });
        return DenonTelnetClientAvrControl.PROTOCOL.POWER.VALUES[response as keyof typeof DenonTelnetClientAvrControl.PROTOCOL.POWER.VALUES];
    }
}
