import { IDenonClient, Playing, RaceStatus } from "./denonClient.js";
import { DenonClientAvrControl } from "./denonClientAvrControl.js";
import { DenonClientHeosCli } from "./denonClientHeosCli.js";
import * as DenonProtocol from "./denonProtocol.js";

export class DenonClientHybrid implements IDenonClient {
  public readonly controlMode = DenonProtocol.ControlMode.HYBRID;
  public readonly serialNumber: string;

  private readonly clientAvrControl;
  private readonly clientHeosCli;

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
    this.clientAvrControl = new DenonClientAvrControl(
      serialNumber,
      host,
      connect_timeout,
      response_timeout,
      debugLogCallback,
      powerUpdateCallback,
      undefined,
      undefined
    );
    this.clientHeosCli = new DenonClientHeosCli(
      serialNumber,
      host,
      connect_timeout,
      response_timeout,
      debugLogCallback,
      undefined,
      muteUpdateCallback,
      volumeUpdateCallback
    );
    this.serialNumber = serialNumber;
  }

  public isConnected(): boolean {
    return this.clientAvrControl.isConnected() || this.clientHeosCli.isConnected();
  }

  public getPower(): Promise<boolean> {
    return this.clientAvrControl.getPower();
  }

  public setPower(power: boolean): Promise<boolean> {
    return this.clientAvrControl.setPower(power);
  }

  public getPlaying(raceStatus: RaceStatus): Promise<Playing> {
    return this.clientHeosCli.getPlaying(raceStatus);
  }

  public setPlaying(playing: Playing): Promise<Playing> {
    return this.clientHeosCli.setPlaying(playing);
  }

  public async setPlayNext(): Promise<void> {
    return this.clientHeosCli.setPlayNext();
  }

  public async setPlayPrevious(): Promise<void> {
    return this.clientHeosCli.setPlayPrevious();
  }

  public getMute(raceStatus?: RaceStatus): Promise<boolean> {
    return this.clientHeosCli.getMute(raceStatus);
  }

  public setMute(mute: boolean): Promise<boolean> {
    return this.clientHeosCli.setMute(mute);
  }

  public getVolume(raceStatus?: RaceStatus): Promise<number> {
    return this.clientHeosCli.getVolume(raceStatus);
  }

  public setVolume(volume: number): Promise<number> {
    return this.clientHeosCli.setVolume(volume);
  }

  public setVolumeUp(volumeIncrement: number): Promise<void> {
    return this.clientHeosCli.setVolumeUp(volumeIncrement);
  }

  public setVolumeDown(volumeDecrement: number): Promise<void> {
    return this.clientHeosCli.setVolumeDown(volumeDecrement);
  }
}
