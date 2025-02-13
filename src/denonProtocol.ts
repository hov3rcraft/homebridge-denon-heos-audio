import * as net from "net";

import { IDenonClient } from "./denonClient.js";
import { DenonClientAvrControl } from "./denonClientAvrControl.js";
import { DenonClientHeosCli } from "./denonClientHeosCli.js";
import { DenonClientHybrid } from "./denonClientHybrid.js";

export enum ControlMode {
  AVRCONTROL = 23,
  HEOSCLI = 1255,
  HYBRID = -1,
}

export const CLIENT_MAP: Record<
  ControlMode,
  new (
    serialNumber: string,
    host: string,
    connect_timeout: number,
    response_timeout: number,
    powerUpdateCallback?: (power: boolean) => void,
    debugLogCallback?: (message: string, ...parameters: any[]) => void
  ) => IDenonClient
> = {
  [ControlMode.AVRCONTROL]: DenonClientAvrControl,
  [ControlMode.HEOSCLI]: DenonClientHeosCli,
  [ControlMode.HYBRID]: DenonClientHybrid,
};

function checkProtocolSupportAtPort(host: string, port: number, debugLogCallback?: (message: string, ...parameters: any[]) => void): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: host, port: port, timeout: 5000 }, () => {
      resolve(true);
      if (debugLogCallback) {
        debugLogCallback("successfully connected to", host, port);
      }
      socket.end();
    });

    socket.on("error", (error) => {
      resolve(false);
      if (debugLogCallback) {
        debugLogCallback("error for", host, port, error.message);
      }
      socket.end();
    });

    socket.on("timeout", () => {
      resolve(false);
      if (debugLogCallback) {
        debugLogCallback("timeout for", host, port);
      }
      socket.end();
    });

    setTimeout(() => {
      if (!socket.destroyed) {
        if (debugLogCallback) {
          debugLogCallback("destroying the socket", host, port);
        }
        socket.destroy();
      }
    }, 10000);
  });
}

export async function checkProtocolSupport(host: string, debugLogCallback?: (message: string, ...parameters: any[]) => void): Promise<ControlMode[]> {
  const supportedProtocols = [];
  for (const controlMode of Object.values(ControlMode).filter((value) => typeof value === "number")) {
    if (controlMode >= 0) {
      const supported = await checkProtocolSupportAtPort(host, controlMode, debugLogCallback);
      if (supported) {
        supportedProtocols.push(controlMode);
      }
    }
  }
  return supportedProtocols;
}
