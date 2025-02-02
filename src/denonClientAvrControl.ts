import { CommandMode, DenonClient, DenonProtocol, InvalidResponseException } from "./denonClient.js";

export class DenonClientAvrControl extends DenonClient {

    public readonly protocol = DenonProtocol.AVRCONTROL;

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

    protected static readonly REVERSE_POWER_VALUES = Object.fromEntries(Object.entries(DenonClientAvrControl.PROTOCOL.POWER.VALUES).map(([key, value]) => [Number(value), key])) as Record<number, string>;

    constructor(serialNumber: string, host: string, connect_timeout: number, response_timeout: number, powerUpdateCallback?: (power: boolean) => void, debugLogCallback?: (message: string, ...parameters: any[]) => void) {
        super(serialNumber, {
            host: host,
            port: DenonProtocol.AVRCONTROL,
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
            let out: string | undefined = undefined;
            if (this.responseCallback.expectedResponse) {
                let match = response.match(this.responseCallback.expectedResponse);
                if (match) {
                    out = match[1] ?? match[0];
                }
            } else {
                out = response;
            }

            if (out) {
                this.debugLog('Received response:', response);
                this.responseCallback.callback(out);
                this.responseCallback = undefined;
                if (this.params.all_responses_to_generic) {
                    this.genericResponseHandler(response);
                }
            }
        } else {
            this.genericResponseHandler(response);
        }
    }

    private genericResponseHandler(response: string) {
        this.debugLog('Received data event:', response);

        // Power
        let match = response.match(DenonClientAvrControl.PROTOCOL.POWER.GET.EXP_RES);
        if (match) {
            if (match[1] in DenonClientAvrControl.PROTOCOL.POWER.VALUES && this.powerUpdateCallback) {
                this.powerUpdateCallback(DenonClientAvrControl.PROTOCOL.POWER.VALUES[match[1] as keyof typeof DenonClientAvrControl.PROTOCOL.POWER.VALUES]);
            } else {
                throw new InvalidResponseException("Unexpected power state", Object.keys(DenonClientAvrControl.PROTOCOL.POWER.VALUES), match[1]);
            }
        }
    }

    public async getPower(): Promise<boolean> {
        let response = await this.sendCommand(DenonClientAvrControl.PROTOCOL.POWER, CommandMode.GET, {});
        return DenonClientAvrControl.PROTOCOL.POWER.VALUES[response as keyof typeof DenonClientAvrControl.PROTOCOL.POWER.VALUES];
    }

    public async setPower(power: boolean): Promise<boolean> {
        let response = await this.sendCommand(DenonClientAvrControl.PROTOCOL.POWER, CommandMode.SET, { value: DenonClientAvrControl.REVERSE_POWER_VALUES[Number(power)] });
        return DenonClientAvrControl.PROTOCOL.POWER.VALUES[response as keyof typeof DenonClientAvrControl.PROTOCOL.POWER.VALUES];
    }
}
