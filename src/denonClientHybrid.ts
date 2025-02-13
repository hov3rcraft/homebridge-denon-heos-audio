import { IDenonClient } from "./denonClient.js";
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
    powerUpdateCallback?: (power: boolean) => void,
    debugLogCallback?: (message: string, ...parameters: any[]) => void
  ) {
    this.clientAvrControl = new DenonClientAvrControl(serialNumber, host, connect_timeout, response_timeout, powerUpdateCallback, debugLogCallback);
    this.clientHeosCli = new DenonClientHeosCli(serialNumber, host, connect_timeout, response_timeout, powerUpdateCallback, debugLogCallback);
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
}
