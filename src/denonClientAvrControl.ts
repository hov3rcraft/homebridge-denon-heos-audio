import { CommandMode, DenonClient, findMapByValue, findValueByMap, InvalidResponseException } from "./denonClient.js";
import * as DenonProtocol from "./denonProtocol.js";

export class DenonClientAvrControl extends DenonClient {
  public readonly controlMode = DenonProtocol.ControlMode.AVRCONTROL;

  protected static readonly PROTOCOL = {
    POWER: {
      GET: {
        COMMAND: "PW?",
        PARAMS: "",
        EXP_RES: /^PW(\w+)$/,
      },
      SET: {
        COMMAND: "PW",
        PARAMS: "[VALUE]",
        EXP_RES: /^PW(\w+)$/,
      },
      VALUES: {
        ON: {
          VALUE: "ON",
          MAP: true,
        },
        OFF: {
          VALUE: "STANDBY",
          MAP: false,
        },
      },
    },
    MUTE: {
      GET: {
        COMMAND: "MU?",
        PARAMS: "",
        EXP_RES: /^MU(\w+)$/,
      },
      SET: {
        COMMAND: "MU",
        PARAMS: "[VALUE]",
        EXP_RES: /^MU(\w+)$/,
      },
      VALUES: {
        ON: {
          VALUE: "ON",
          MAP: true,
        },
        OFF: {
          VALUE: "OFF",
          MAP: false,
        },
      },
    },
    VOLUME: {
      GET: {
        COMMAND: "MV?",
        PARAMS: "",
        EXP_RES: /^MV(\d{2})$/,
      },
      SET: {
        COMMAND: "MV?",
        PARAMS: "[VALUE]",
        EXP_RES: /^MV(\d{2})$/,
      },
    },
  };

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
        port: DenonProtocol.ControlMode.AVRCONTROL,
        connect_timeout: connect_timeout,
        response_timeout: response_timeout,
        command_prefix: undefined,
        command_separator: "\r\n",
        response_separator: "\r",
        all_responses_to_generic: false,
      },
      debugLogCallback,
      powerUpdateCallback,
      muteUpdateCallback,
      volumeUpdateCallback
    );

    this.connect();
  }

  protected async subscribeToChangeEvents(): Promise<void> {
    // not necessary - change events are automatically sent in AVR control
  }

  protected responseRouter(response: string) {
    if (this.responseCallback) {
      let out: string | undefined = undefined;
      if (this.responseCallback.expectedResponse) {
        console.log(this.responseCallback.expectedResponse);
        const match = response.match(this.responseCallback.expectedResponse);
        console.log(JSON.stringify(match));
        if (match) {
          out = match[1] ?? match[0];
        }
      } else {
        out = response;
      }

      if (out) {
        this.debugLog("Received response:", response);
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
    this.debugLog("Received data event:", response);

    // Power
    let match = response.match(DenonClientAvrControl.PROTOCOL.POWER.GET.EXP_RES);
    if (match) {
      const mappedValue = findMapByValue(DenonClientAvrControl.PROTOCOL.POWER.VALUES, match[1]);
      if (mappedValue === undefined) {
        throw new InvalidResponseException(
          "Unexpected power state",
          Object.values(DenonClientAvrControl.PROTOCOL.POWER.VALUES).map((value) => value.VALUE),
          match[1]
        );
      }

      if (this.powerUpdateCallback) {
        this.powerUpdateCallback(mappedValue);
      }
      return;
    }

    // Mute
    match = response.match(DenonClientAvrControl.PROTOCOL.MUTE.GET.EXP_RES);
    if (match) {
      const mappedValue = findMapByValue(DenonClientAvrControl.PROTOCOL.MUTE.VALUES, match[1]);
      if (mappedValue === undefined) {
        throw new InvalidResponseException(
          "Unexpected mute state",
          Object.values(DenonClientAvrControl.PROTOCOL.MUTE.VALUES).map((value) => value.VALUE),
          match[1]
        );
      }

      if (this.muteUpdateCallback) {
        this.muteUpdateCallback(mappedValue);
      }
      return;
    }

    // Volume
    match = response.match(DenonClientAvrControl.PROTOCOL.VOLUME.GET.EXP_RES);
    if (match) {
      if (this.volumeUpdateCallback) {
        this.volumeUpdateCallback(Number(match[1]));
      }
      return;
    }
  }

  public async getPower(): Promise<boolean> {
    const response = await this.sendCommand(DenonClientAvrControl.PROTOCOL.POWER, CommandMode.GET, {});
    const mappedValue = findMapByValue(DenonClientAvrControl.PROTOCOL.POWER.VALUES, response);
    return mappedValue;
  }

  public async setPower(power: boolean): Promise<boolean> {
    const response = await this.sendCommand(DenonClientAvrControl.PROTOCOL.POWER, CommandMode.SET, {
      value: findValueByMap(DenonClientAvrControl.PROTOCOL.POWER.VALUES, power),
    });
    const mappedValue = findMapByValue(DenonClientAvrControl.PROTOCOL.POWER.VALUES, response);
    return mappedValue;
  }

  public async getMute(): Promise<boolean> {
    const response = await this.sendCommand(DenonClientAvrControl.PROTOCOL.MUTE, CommandMode.GET, {});
    const mappedValue = findMapByValue(DenonClientAvrControl.PROTOCOL.MUTE.VALUES, response);
    return mappedValue;
  }

  public async setMute(mute: boolean): Promise<boolean> {
    const response = await this.sendCommand(DenonClientAvrControl.PROTOCOL.MUTE, CommandMode.SET, {
      value: findValueByMap(DenonClientAvrControl.PROTOCOL.MUTE.VALUES, mute),
    });
    const mappedValue = findMapByValue(DenonClientAvrControl.PROTOCOL.MUTE.VALUES, response);
    return mappedValue;
  }

  public async getVolume(): Promise<number> {
    const response = await this.sendCommand(DenonClientAvrControl.PROTOCOL.VOLUME, CommandMode.GET, {});
    return Number(response);
  }

  public async setVolume(volume: number): Promise<number> {
    if (volume < 0 || volume > 100) {
      throw new Error("Volume must be between 0 and 100");
    }

    if (volume === 100) {
      volume = 99;
    }

    const response = await this.sendCommand(DenonClientAvrControl.PROTOCOL.VOLUME, CommandMode.SET, {
      value: Math.round(volume).toString().padStart(2, "0"),
    });
    return Number(response);
  }

  public async setVolumeRelative(direction: boolean): Promise<number> {
    // TODO
    return -1;
  }
}
