import { CommandFailedException, CommandMode, DenonClient, InvalidResponseException, IS_PLAYING, Playing, RaceStatus } from "./denonClient.js";
import { DenonProtocol } from "./denonProtocol.js";

export class DenonClientHeosCli extends DenonClient {

    public readonly protocol = DenonProtocol.HEOSCLI;

    protected static readonly PROTOCOL = {
        GLOBAL_CHANGE_EVENT_REGEX: /^event\/(\w+)$/,
        PID_REGEX: /pid=(\d+)/,
        EVENT_SUB: {
            SET: {
                COMMAND: 'system/register_for_change_events',
                PARAMS: '?enable=[VALUE]',
                EXP_RES: /enable=(\w+)/
            },
            VALUES: {
                "on": true,
                "off": false
            }
        },
        PLAYERS: {
            GET: {
                COMMAND: 'player/get_players',
                PARAMS: '',
            }
        },
        PLAY_STATE: {
            GET: {
                COMMAND: 'player/get_play_state',
                PARAMS: '?pid=[PID]',
                EVENT: 'event/player_state_changed',
                EXP_RES: /state=(\w+)/
            },
            SET: {
                COMMAND: 'player/set_play_state',
                PARAMS: '?pid=[PID]&state=[VALUE]',
                EXP_RES: /state=(\w+)/
            },
            VALUES: {
                "play": Playing.PLAY,
                "pause": Playing.PAUSE,
                "stop": Playing.STOP
            }
        }
    }

    protected static readonly REVERSE_PLAY_STATE_VALUES = Object.fromEntries(Object.entries(DenonClientHeosCli.PROTOCOL.PLAY_STATE.VALUES).map(([key, value]) => [value, key])) as Record<Playing, string>;

    protected static readonly REVERSE_EVENT_SUB_VALUES = Object.fromEntries(Object.entries(DenonClientHeosCli.PROTOCOL.EVENT_SUB.VALUES).map(([key, value]) => [Number(value), key])) as Record<number, string>;

    private player_id: number | undefined;

    constructor(serialNumber: string, host: string, connect_timeout: number, response_timeout: number, powerUpdateCallback?: (power: boolean) => void, debugLogCallback?: (message: string, ...parameters: any[]) => void) {
        super(serialNumber, {
            host: host,
            port: DenonProtocol.HEOSCLI,
            connect_timeout: connect_timeout,
            response_timeout: response_timeout,
            command_prefix: 'heos://',
            command_separator: '\r\n',
            response_separator: '\r\n',
            all_responses_to_generic: false
        }, powerUpdateCallback, debugLogCallback);

        this.player_id = undefined;
        this.findPlayerId();
    }

    private async findPlayerId() {
        const payload_str = await super.sendCommand(DenonClientHeosCli.PROTOCOL.PLAYERS, CommandMode.GET, { passPayload: true });
        const payload = JSON.parse(payload_str);
        if (!Array.isArray(payload)) {
            throw new InvalidResponseException("Payload is not an array!", undefined, payload_str);
        }
        for (const player of payload) {
            if (player.serial === this.serialNumber) {
                this.player_id = player.pid;
                return;
            }
        }
        throw new InvalidResponseException("Player list does not include serial " + this.serialNumber);
    }

    protected async subscribeToChangeEvents(): Promise<void> {
        const commandStr = (DenonClientHeosCli.PROTOCOL.EVENT_SUB.SET.COMMAND + DenonClientHeosCli.PROTOCOL.EVENT_SUB.SET.PARAMS)
            .replace("[VALUE]", DenonClientHeosCli.REVERSE_EVENT_SUB_VALUES[Number(true)]);
        const response = await this.sendUnchecked(commandStr, DenonClientHeosCli.PROTOCOL.EVENT_SUB.SET.COMMAND, DenonClientHeosCli.PROTOCOL.EVENT_SUB.SET.EXP_RES);

        if (!(response in DenonClientHeosCli.PROTOCOL.EVENT_SUB.VALUES)) {
            throw new InvalidResponseException("No valid response!", Object.keys(DenonClientHeosCli.PROTOCOL.EVENT_SUB.VALUES), response);
        }

        if (response !== DenonClientHeosCli.REVERSE_EVENT_SUB_VALUES[Number(true)]) {
            throw new CommandFailedException(commandStr);
        }
    }

    protected async sendCommand(command: any, commandMode: CommandMode, { value, passPayload = false }: { value?: string, passPayload?: boolean }): Promise<string> {
        if (!this.player_id) {
            this.findPlayerId();
        }
        return super.sendCommand(command, commandMode, { pid: this.player_id, value: value, passPayload: passPayload });
    }

    protected responseRouter(response: string) {
        let r_obj: any;
        try {
            r_obj = JSON.parse(response);
        } catch (error) {
            throw new InvalidResponseException("Received a response that is not valid JSON!", undefined, response);
        }

        if (r_obj.heos === undefined || r_obj.heos.message === undefined) {
            throw new InvalidResponseException("Received response that does not follow HeosCLI specifications", undefined, response);
        }

        if (this.responseCallback && this.responseCallback.command === r_obj.heos.command.trim()) {
            let out: string | undefined = undefined;
            if (r_obj.heos.success !== undefined && r_obj.heos.success !== "success") {
                const error = new CommandFailedException(this.responseCallback.command);
                this.responseCallback = undefined;
                throw error;
            }

            let pid_match = r_obj.heos.message.match(DenonClientHeosCli.PROTOCOL.PID_REGEX);
            if (!pid_match || Number(pid_match[1]) === this.player_id) {
                if (this.responseCallback.expectedResponse) {
                    let value_match = r_obj.heos.message.match(this.responseCallback.expectedResponse);
                    if (value_match) {
                        out = value_match[1];
                    }
                } else {
                    out = r_obj.heos.message;
                }
            }

            if (out !== undefined) {
                if (this.responseCallback.passPayload) {
                    if (r_obj.payload === undefined) {
                        throw new InvalidResponseException("Received a response does not include a payload!");
                    }
                    out = JSON.stringify(r_obj.payload)
                }
                this.debugLog('Received response:', response);

                this.responseCallback.callback(out);
                this.responseCallback = undefined;
                if (this.params.all_responses_to_generic) {
                    this.genericResponseHandler(r_obj);
                }
            }
        } else {
            this.genericResponseHandler(r_obj);
        }
    }

    private genericResponseHandler(r_obj: any) {
        if (!r_obj.heos.command.match(DenonClientHeosCli.PROTOCOL.GLOBAL_CHANGE_EVENT_REGEX)) {
            return; // not an event
        }

        const pid_match = r_obj.heos.message.match(DenonClientHeosCli.PROTOCOL.PID_REGEX);
        if (!pid_match || Number(pid_match[1]) !== this.player_id) {
            return; // not this player
        }

        this.debugLog('Received change event:', JSON.stringify(r_obj));

        switch (r_obj.heos.command) {
            case DenonClientHeosCli.PROTOCOL.PLAY_STATE.GET.EVENT:
                const match = r_obj.heos.message.match(DenonClientHeosCli.PROTOCOL.PLAY_STATE.GET.EXP_RES);
                if (match && match[1] in DenonClientHeosCli.PROTOCOL.PLAY_STATE.VALUES && this.powerUpdateCallback) {
                    this.powerUpdateCallback(IS_PLAYING[DenonClientHeosCli.PROTOCOL.PLAY_STATE.VALUES[match[1] as keyof typeof DenonClientHeosCli.PROTOCOL.PLAY_STATE.VALUES]]);
                }
                else {
                    throw new InvalidResponseException("Unexpected play state", Object.keys(DenonClientHeosCli.PROTOCOL.PLAY_STATE.VALUES), r_obj.heos.message);
                }
                break;
        }
    }

    public async getPlaying(): Promise<Playing> {
        let response = await this.sendCommand(DenonClientHeosCli.PROTOCOL.PLAY_STATE, CommandMode.GET, {});
        return DenonClientHeosCli.PROTOCOL.PLAY_STATE.VALUES[response as keyof typeof DenonClientHeosCli.PROTOCOL.PLAY_STATE.VALUES];
    }

    public async setPlaying(playing: Playing): Promise<Playing> {
        let response = await this.sendCommand(DenonClientHeosCli.PROTOCOL.PLAY_STATE, CommandMode.SET, { value: DenonClientHeosCli.REVERSE_PLAY_STATE_VALUES[playing] });
        return DenonClientHeosCli.PROTOCOL.PLAY_STATE.VALUES[response as keyof typeof DenonClientHeosCli.PROTOCOL.PLAY_STATE.VALUES];
    }

    public async getPower(raceStatus?: RaceStatus): Promise<boolean> {
        const playing = await this.getPlaying();
        if (raceStatus && !raceStatus.isRunning() && this.powerUpdateCallback) {
            this.powerUpdateCallback(IS_PLAYING[playing]);
            this.debugLog(`getPower was late to the party [race id: ${raceStatus.raceId}].`);
        }
        return IS_PLAYING[playing];
    }

    public async setPower(power: boolean): Promise<boolean> {
        const newPlaying = await this.setPlaying(power ? Playing.PLAY : Playing.STOP);
        if (this.powerUpdateCallback) {
            this.powerUpdateCallback(IS_PLAYING[newPlaying]);
        }
        return IS_PLAYING[newPlaying];
    }

    public async getPlay(): Promise<boolean> {
        return IS_PLAYING[await this.getPlaying()];
    }

    public async setPlay(play: boolean): Promise<boolean> {
        return IS_PLAYING[await this.setPlaying(play ? Playing.PLAY : Playing.PAUSE)]
    }
}