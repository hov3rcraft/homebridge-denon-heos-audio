import { CommandFailedException, DenonTelnetClient, DenonTelnetMode, InvalidResponseException, IS_PLAYING, Playing, RaceStatus } from "./denonTelnetClient.js";

export class DenonTelnetClientHeosCli extends DenonTelnetClient {

    public readonly mode = DenonTelnetMode.HEOSCLI;

    protected static readonly PROTOCOL = {
        GLOBAL_PREFIX: "heos://",
        GLOBAL_CHANGE_EVENT_REGEX: /^event\/(\w+)$/,
        PID_REGEX: /pid=(\d+)/,
        EVENT_SUB: {
            SET: {
                COMMAND: 'system/register_for_change_events',
                PARAMS: '?enable=[VALUE]',
                MESSAGE: 'enable=[VALUE]'
            },
            VALUES: {
                "on": true,
                "off": false
            }
        },
        PLAYERS: {
            GET: {
                COMMAND: 'player/get_players',
                PARAMS: ''
            }
        },
        PLAY_STATE: {
            GET: {
                COMMAND: 'player/get_play_state',
                PARAMS: '?pid=[PID]',
                EVENT: 'event/player_state_changed',
                MESSAGE: 'pid=[PID]&state=[VALUE]'
            },
            SET: {
                COMMAND: 'player/set_play_state',
                PARAMS: '?pid=[PID]&state=[VALUE]',
                MESSAGE: 'pid=[PID]&state=[VALUE]'
            },
            VALUES: {
                "play": Playing.PLAY,
                "pause": Playing.PAUSE,
                "stop": Playing.STOP
            }
        }
    }

    protected static readonly REVERSE_PLAY_STATE_VALUES = Object.fromEntries(Object.entries(DenonTelnetClientHeosCli.PROTOCOL.PLAY_STATE.VALUES).map(([key, value]) => [value, key])) as Record<Playing, string>;

    protected static readonly REVERSE_EVENT_SUB_VALUES = Object.fromEntries(Object.entries(DenonTelnetClientHeosCli.PROTOCOL.EVENT_SUB.VALUES).map(([key, value]) => [Number(value), key])) as Record<number, string>;

    private player_id: number | undefined;

    constructor(serialNumber: string, host: string, timeout: number = 1500, powerUpdateCallback?: (power: boolean) => void, debugLogCallback?: (message: string, ...parameters: any[]) => void) {
        super(serialNumber, {
            host: host,
            port: DenonTelnetMode.HEOSCLI,
            timeout: timeout,
            negotiationMandatory: false,
            irs: '\r\n',
            ors: '\r\n',
            echoLines: 0,
        }, powerUpdateCallback, debugLogCallback);

        this.player_id = undefined;
        this.findPlayerId();
    }

    private async findPlayerId() {
        const commandStr = DenonTelnetClientHeosCli.PROTOCOL.GLOBAL_PREFIX + DenonTelnetClientHeosCli.PROTOCOL.PLAYERS.GET.COMMAND;
        const responses = await this.send(commandStr);
        for (const r of responses) {
            let r_obj = JSON.parse(r);
            if (r_obj.heos.command !== DenonTelnetClientHeosCli.PROTOCOL.PLAYERS.GET.COMMAND) {
                continue;
            }
            if (r_obj.heos.result !== "success") {
                throw new CommandFailedException(commandStr);
            }
            for (const player of r_obj.payload) {
                if (player.serial === this.serialNumber) {
                    this.player_id = player.pid;
                    break;
                }
            }
        }
        if (!this.player_id) {
            throw new InvalidResponseException("Player list does not include serial " + this.serialNumber);
        }
    }

    protected async subscribeToChangeEvents(): Promise<void> {
        const commandStr = (DenonTelnetClientHeosCli.PROTOCOL.GLOBAL_PREFIX + DenonTelnetClientHeosCli.PROTOCOL.EVENT_SUB.SET.COMMAND + DenonTelnetClientHeosCli.PROTOCOL.EVENT_SUB.SET.PARAMS)
            .replace("[VALUE]", DenonTelnetClientHeosCli.REVERSE_EVENT_SUB_VALUES[Number(true)]);
        const responses = await this.sendUnchecked(commandStr);
        for (const r of responses) {
            let r_obj = JSON.parse(r);
            if (r_obj.heos.command !== DenonTelnetClientHeosCli.PROTOCOL.EVENT_SUB.SET.COMMAND) {
                continue;
            }
            if (r_obj.heos.result === "success") {
                return;
            } else {
                throw new CommandFailedException(commandStr);
            }
        }
        throw new InvalidResponseException("No valid response!", [DenonTelnetClientHeosCli.PROTOCOL.EVENT_SUB.SET.MESSAGE], "");
    }

    private async sendCommandAndParseResponse(command: any, value?: any): Promise<string> {
        if (!this.player_id) {
            await this.findPlayerId();
        }

        let commandStr = DenonTelnetClientHeosCli.PROTOCOL.GLOBAL_PREFIX + command.COMMAND + command.PARAMS;
        commandStr = commandStr.replace("[PID]", this.player_id!.toString());
        if (value) {
            commandStr = commandStr.replace("[VALUE]", value);
        }

        const responses = await this.send(commandStr);

        let expectedMessage = command.MESSAGE;
        if (this.player_id) {
            expectedMessage = expectedMessage.replace("[PID]", this.player_id.toString());
        }
        for (const r of responses) {
            this.debugLog('Received response:', r);
            const r_obj = JSON.parse(r)
            if (r_obj.heos.command !== command.COMMAND) {
                continue;
            }
            if (r_obj.heos.result !== "success") {
                throw new CommandFailedException(commandStr);
            }

            const captures = r_obj.heos.message.match(new RegExp(`^${expectedMessage}$`.replace("[VALUE]", "(\\w+)")));
            if (captures && captures.length === 2) {
                return captures[1];
            }
            else {
                throw new InvalidResponseException("Result message unexpected", expectedMessage, r_obj.heos.message);
            }
        }
        throw new InvalidResponseException("No valid response!", expectedMessage, "");
    }

    protected genericResponseHandler(response: string) {
        const r_obj = JSON.parse(response)

        if (!r_obj.heos.command.match(DenonTelnetClientHeosCli.PROTOCOL.GLOBAL_CHANGE_EVENT_REGEX)) {
            return; // not an event
        }

        const pid_match = r_obj.heos.message.match(DenonTelnetClientHeosCli.PROTOCOL.PID_REGEX);
        if (!pid_match || Number(pid_match[1]) !== this.player_id) {
            return; // not this player
        }

        this.debugLog('Received change event:', response);

        switch (r_obj.heos.command) {
            case DenonTelnetClientHeosCli.PROTOCOL.PLAY_STATE.GET.EVENT:
                const captures = r_obj.heos.message.match(new RegExp(`^${DenonTelnetClientHeosCli.PROTOCOL.PLAY_STATE.GET.MESSAGE}$`.replace("[PID]", this.player_id.toString()).replace("[VALUE]", "(\\w+)")));
                if (captures && captures.length === 2 && captures[1] in DenonTelnetClientHeosCli.PROTOCOL.PLAY_STATE.VALUES && this.powerUpdateCallback) {
                    this.powerUpdateCallback(IS_PLAYING[DenonTelnetClientHeosCli.PROTOCOL.PLAY_STATE.VALUES[captures[1] as keyof typeof DenonTelnetClientHeosCli.PROTOCOL.PLAY_STATE.VALUES]]);
                }
                else {
                    throw new InvalidResponseException("Event message unexpected", [DenonTelnetClientHeosCli.PROTOCOL.PLAY_STATE.GET.MESSAGE], r_obj.heos.message);
                }
                break;
        }
    }

    public async getPlaying(): Promise<Playing> {
        let response = await this.sendCommandAndParseResponse(DenonTelnetClientHeosCli.PROTOCOL.PLAY_STATE.GET);
        if (response in DenonTelnetClientHeosCli.PROTOCOL.PLAY_STATE.VALUES) {
            return DenonTelnetClientHeosCli.PROTOCOL.PLAY_STATE.VALUES[response as keyof typeof DenonTelnetClientHeosCli.PROTOCOL.PLAY_STATE.VALUES];
        }
        throw new InvalidResponseException("Unexpected play state", Object.keys(DenonTelnetClientHeosCli.PROTOCOL.PLAY_STATE.VALUES), response);
    }

    public async setPlaying(playing: Playing): Promise<Playing> {
        let response = await this.sendCommandAndParseResponse(DenonTelnetClientHeosCli.PROTOCOL.PLAY_STATE.SET, DenonTelnetClientHeosCli.REVERSE_PLAY_STATE_VALUES[playing]);
        if (response in DenonTelnetClientHeosCli.PROTOCOL.PLAY_STATE.VALUES) {
            return DenonTelnetClientHeosCli.PROTOCOL.PLAY_STATE.VALUES[response as keyof typeof DenonTelnetClientHeosCli.PROTOCOL.PLAY_STATE.VALUES];
        }
        throw new InvalidResponseException("Unexpected play state", Object.keys(DenonTelnetClientHeosCli.PROTOCOL.PLAY_STATE.VALUES), response);
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