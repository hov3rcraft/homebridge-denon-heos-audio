import { CommandFailedException, CommandMode, DenonClient, findMapByValue, findValueByMap, InvalidResponseException, RaceStatus } from "./denonClient.js";
import * as DenonProtocol from "./denonProtocol.js";

enum Playing {
  PLAY,
  PAUSE,
  STOP,
}

const isPlaying: Record<Playing, boolean> = {
  [Playing.PLAY]: true,
  [Playing.PAUSE]: false,
  [Playing.STOP]: false,
};

export class DenonClientHeosCli extends DenonClient {
  public readonly controlMode = DenonProtocol.ControlMode.HEOSCLI;

  protected static readonly PROTOCOL = {
    GLOBAL_CHANGE_EVENT_REGEX: /^event\/(\w+)$/,
    PID_REGEX: /pid=(\d+)/,
    EVENT_SUB: {
      SET: {
        COMMAND: "system/register_for_change_events",
        PARAMS: "?enable=[VALUE]",
        EXP_RES: /enable=(\w+)/,
      },
      VALUES: {
        ON: {
          VALUE: "on",
          MAP: true,
        },
        OFF: {
          VALUE: "off",
          MAP: false,
        },
      },
    },
    PLAYERS: {
      GET: {
        COMMAND: "player/get_players",
        PARAMS: "",
        EXP_RES: /^$/,
      },
    },
    PLAY_STATE: {
      GET: {
        COMMAND: "player/get_play_state",
        PARAMS: "?pid=[PID]",
        EXP_RES: /state=(\w+)/,
      },
      SET: {
        COMMAND: "player/set_play_state",
        PARAMS: "?pid=[PID]&state=[VALUE]",
        EXP_RES: /state=(\w+)/,
      },
      EVENT: {
        COMMAND: "event/player_state_changed",
        EXP_RES: /state=(\w+)/,
      },
      VALUES: {
        PLAY: {
          VALUE: "play",
          MAP: Playing.PLAY,
        },
        PAUSE: {
          VALUE: "pause",
          MAP: Playing.PAUSE,
        },
        STOP: {
          VALUE: "stop",
          MAP: Playing.STOP,
        },
      },
    },
    MUTE: {
      GET: {
        COMMAND: "player/get_mute",
        PARAMS: "?pid=[PID]",
        EXP_RES: /state=(\w+)/,
      },
      SET: {
        COMMAND: "player/set_mute",
        PARAMS: "?pid=[PID]&state=[VALUE]",
        EXP_RES: /state=(\w+)/,
      },
      EVENT: {
        EVENT: "event/player_volume_changed",
        EXP_RES: /mute=(\w+)/,
      },
      VALUES: {
        ON: {
          VALUE: "on",
          MAP: true,
        },
        OFF: {
          VALUE: "off",
          MAP: false,
        },
      },
    },
    VOLUME: {
      GET: {
        COMMAND: "player/get_volume",
        PARAMS: "?pid=[PID]",
        EXP_RES: /level=(\d+)/,
      },
      SET: {
        COMMAND: "player/set_volume",
        PARAMS: "?pid=[PID]&level=[VALUE]",
        EXP_RES: /level=(\d+)/,
      },
      EVENT: {
        EVENT: "event/player_volume_changed",
        EXP_RES: /level=(\d+)/,
      },
    },
    VOLUME_UP: {
      SET: {
        COMMAND: "player/volume_up",
        PARAMS: "?pid=[PID]&step=[VALUE]",
        EXP_RES: /step=(\d+)/,
      },
    },
    VOLUME_DOWN: {
      SET: {
        COMMAND: "player/volume_down",
        PARAMS: "?pid=[PID]&step=[VALUE]",
        EXP_RES: /step=(\d+)/,
      },
    },
  };

  private player_id: number | undefined;

  constructor(
    serialNumber: string,
    host: string,
    connect_timeout: number,
    response_timeout: number,
    debugLogCallback?: (message: string, ...parameters: any[]) => void,
    powerUpdateCallback?: (power: boolean) => void,
    muteUpdateCallback?: (mute: boolean) => void,
    volumeUpdateCallback?: (volume: number) => void
  ) {
    super(
      serialNumber,
      {
        host: host,
        port: DenonProtocol.ControlMode.HEOSCLI,
        connect_timeout: connect_timeout,
        response_timeout: response_timeout,
        command_prefix: "heos://",
        command_separator: "\r\n",
        response_separator: "\r\n",
        all_responses_to_generic: false,
      },
      debugLogCallback,
      powerUpdateCallback,
      muteUpdateCallback,
      volumeUpdateCallback
    );

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
    const commandStr = (DenonClientHeosCli.PROTOCOL.EVENT_SUB.SET.COMMAND + DenonClientHeosCli.PROTOCOL.EVENT_SUB.SET.PARAMS).replace(
      "[VALUE]",
      DenonClientHeosCli.PROTOCOL.EVENT_SUB.VALUES.ON.VALUE
    );
    const response = await this.sendUnchecked(commandStr, DenonClientHeosCli.PROTOCOL.EVENT_SUB.SET.COMMAND, DenonClientHeosCli.PROTOCOL.EVENT_SUB.SET.EXP_RES);
    const mappedValue = findMapByValue(DenonClientHeosCli.PROTOCOL.EVENT_SUB.VALUES, response);

    if (mappedValue === undefined) {
      throw new InvalidResponseException(
        "No valid response!",
        Object.values(DenonClientHeosCli.PROTOCOL.EVENT_SUB.VALUES).map((value) => value.VALUE),
        response
      );
    }

    if (response !== DenonClientHeosCli.PROTOCOL.EVENT_SUB.VALUES.ON.VALUE) {
      throw new CommandFailedException(commandStr);
    }
  }

  protected async sendCommand(
    command: any,
    commandMode: CommandMode,
    { value, passPayload = false }: { value?: string; passPayload?: boolean }
  ): Promise<string> {
    if (!this.player_id) {
      this.findPlayerId();
    }
    return super.sendCommand(command, commandMode, { pid: this.player_id, value: value, passPayload: passPayload });
  }

  protected responseRouter(response: string) {
    let r_obj: any;
    try {
      r_obj = JSON.parse(response);
    } catch {
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

      const pid_match = r_obj.heos.message.match(DenonClientHeosCli.PROTOCOL.PID_REGEX);
      if (!pid_match || Number(pid_match[1]) === this.player_id) {
        const message_match = r_obj.heos.message.match(this.responseCallback.expectedResponse);
        if (message_match) {
          out = message_match.length > 1 ? message_match[1] : r_obj.heos.message;
        }
      }

      if (out !== undefined) {
        if (this.responseCallback.passPayload) {
          if (r_obj.payload === undefined) {
            throw new InvalidResponseException("Received a response does not include a payload!");
          }
          out = JSON.stringify(r_obj.payload);
        }
        this.debugLog("Received response:", response);

        this.responseCallback.callback(out);
        this.responseCallback = undefined;
        if (this.params.all_responses_to_generic) {
          this.genericResponseHandler(r_obj);
        }
      } else {
        this.genericResponseHandler(r_obj);
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

    this.debugLog("Received change event:", JSON.stringify(r_obj));

    // Play state
    if (r_obj.heos.command === DenonClientHeosCli.PROTOCOL.PLAY_STATE.EVENT.COMMAND) {
      const match = r_obj.heos.message.match(DenonClientHeosCli.PROTOCOL.PLAY_STATE.EVENT.EXP_RES);

      if (!match) {
        throw new InvalidResponseException(
          "Unexpected play state",
          Object.values(DenonClientHeosCli.PROTOCOL.PLAY_STATE.VALUES).map((value) => value.VALUE),
          r_obj.heos.message
        );
      }

      const mappedValue = findMapByValue(DenonClientHeosCli.PROTOCOL.PLAY_STATE.VALUES, match[1]);
      if (mappedValue === undefined) {
        throw new InvalidResponseException(
          "Unexpected play state",
          Object.values(DenonClientHeosCli.PROTOCOL.PLAY_STATE.VALUES).map((value) => value.VALUE),
          r_obj.heos.message
        );
      }

      console.log("Play state callback:", mappedValue);

      if (this.powerUpdateCallback) {
        this.powerUpdateCallback(mappedValue);
      }
    }
  }

  public async getPlaying(): Promise<Playing> {
    const response = await this.sendCommand(DenonClientHeosCli.PROTOCOL.PLAY_STATE, CommandMode.GET, {});
    const mappedValue = findMapByValue(DenonClientHeosCli.PROTOCOL.PLAY_STATE.VALUES, response);
    return mappedValue;
  }

  public async setPlaying(playing: Playing): Promise<Playing> {
    const response = await this.sendCommand(DenonClientHeosCli.PROTOCOL.PLAY_STATE, CommandMode.SET, {
      value: findValueByMap(DenonClientHeosCli.PROTOCOL.PLAY_STATE.VALUES, playing),
    });
    const mappedValue = findMapByValue(DenonClientHeosCli.PROTOCOL.PLAY_STATE.VALUES, response);
    return mappedValue;
  }

  public async getPower(raceStatus?: RaceStatus): Promise<boolean> {
    const playing = await this.getPlaying();
    if (raceStatus && !raceStatus.isRunning() && this.powerUpdateCallback) {
      this.powerUpdateCallback(isPlaying[playing]);
      this.debugLog(`getPower was late to the party [race id: ${raceStatus.raceId}].`);
    }
    console.log(isPlaying[playing]);
    return isPlaying[playing];
  }

  public async setPower(power: boolean): Promise<boolean> {
    const newPlaying = await this.setPlaying(power ? Playing.PLAY : Playing.STOP);
    if (this.powerUpdateCallback) {
      this.powerUpdateCallback(isPlaying[newPlaying]);
    }
    return isPlaying[newPlaying];
  }

  public async getPlay(): Promise<boolean> {
    return isPlaying[await this.getPlaying()];
  }

  public async setPlay(play: boolean): Promise<boolean> {
    return isPlaying[await this.setPlaying(play ? Playing.PLAY : Playing.PAUSE)];
  }

  public async getMute(raceStatus?: RaceStatus): Promise<boolean> {
    const response = await this.sendCommand(DenonClientHeosCli.PROTOCOL.MUTE, CommandMode.GET, {});
    const mappedValue = findMapByValue(DenonClientHeosCli.PROTOCOL.MUTE.VALUES, response);
    if (raceStatus && !raceStatus.isRunning() && this.muteUpdateCallback) {
      this.muteUpdateCallback(mappedValue);
      this.debugLog(`getMute was late to the party [race id: ${raceStatus.raceId}].`);
    }
    return mappedValue;
  }

  public async setMute(mute: boolean): Promise<boolean> {
    const response = await this.sendCommand(DenonClientHeosCli.PROTOCOL.MUTE, CommandMode.SET, {
      value: findValueByMap(DenonClientHeosCli.PROTOCOL.MUTE.VALUES, mute),
    });

    const mappedValue = findMapByValue(DenonClientHeosCli.PROTOCOL.MUTE.VALUES, response);
    if (this.muteUpdateCallback) {
      this.muteUpdateCallback(mappedValue);
    }

    return mappedValue;
  }

  public async getVolume(raceStatus?: RaceStatus): Promise<number> {
    const response = await this.sendCommand(DenonClientHeosCli.PROTOCOL.VOLUME, CommandMode.GET, {});
    if (raceStatus && !raceStatus.isRunning() && this.volumeUpdateCallback) {
      this.volumeUpdateCallback(Number(response));
      this.debugLog(`getVolume was late to the party [race id: ${raceStatus.raceId}].`);
    }
    return Number(response);
  }

  public async setVolume(volume: number): Promise<number> {
    if (volume < 0 || volume > 100) {
      throw new Error("Volume must be between 0 and 100");
    }

    const response = await this.sendCommand(DenonClientHeosCli.PROTOCOL.VOLUME, CommandMode.SET, {
      value: Math.round(volume).toString(),
    });

    if (this.volumeUpdateCallback) {
      this.volumeUpdateCallback(Number(response));
    }

    return Number(response);
  }

  public async setVolumeUp(volumeIncrement: number): Promise<void> {
    if (volumeIncrement < 1 || volumeIncrement > 10) {
      throw new Error("Volume increment must be between 1 and 10");
    }

    await this.sendCommand(DenonClientHeosCli.PROTOCOL.VOLUME_UP, CommandMode.SET, {
      value: Math.round(volumeIncrement).toString(),
    });
  }

  public async setVolumeDown(volumeDecrement: number): Promise<void> {
    if (volumeDecrement < 1 || volumeDecrement > 10) {
      throw new Error("Volume decrement must be between 1 and 10");
    }

    await this.sendCommand(DenonClientHeosCli.PROTOCOL.VOLUME_DOWN, CommandMode.SET, {
      value: Math.round(volumeDecrement).toString(),
    });
  }
}
