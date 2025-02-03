import * as net from 'net';

import { IDenonClient } from './denonClient.js';
import { DenonClientAvrControl } from './denonClientAvrControl.js';
import { DenonClientHeosCli } from './denonClientHeosCli.js';
import { DenonClientHybrid } from './denonClientHybrid.js';

export enum DenonProtocol {
    AVRCONTROL = 23,
    HEOSCLI = 1255,
    HYBRID = -1,
    //AUTO = -2
}

export namespace DenonProtocol {

    export const CLIENT_MAP: Record<DenonProtocol, new (serialNumber: string, host: string, connect_timeout: number, response_timeout: number,
        powerUpdateCallback?: (power: boolean) => void, debugLogCallback?: (message: string, ...parameters: any[]) => void) => IDenonClient> = {
        [DenonProtocol.AVRCONTROL]: DenonClientAvrControl,
        [DenonProtocol.HEOSCLI]: DenonClientHeosCli,
        [DenonProtocol.HYBRID]: DenonClientHybrid,
    }

    function checkProtocolSupportAtPort(host: string, port: number, debugLogCallback?: (message: string, ...parameters: any[]) => void): Promise<boolean> {
        return new Promise((resolve, reject) => {
            const socket = net.createConnection({ host: host, port: port, timeout: 5000 }, () => {
                resolve(true);
                if (debugLogCallback) {
                    debugLogCallback("successfully connected to", host, port);
                }
                socket.end();
            });

            socket.on('error', (error) => {
                resolve(false);
                if (debugLogCallback) {
                    debugLogCallback("error for", host, port, error.message);
                }
                socket.end();
            });

            socket.on('timeout', () => {
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

    export async function checkProtocolSupport(host: string, debugLogCallback?: (message: string, ...parameters: any[]) => void): Promise<DenonProtocol[]> {
        let supportedProtocols = [];
        for (const protocol of Object.values(DenonProtocol).filter(value => typeof value === 'number')) {
            if (protocol >= 0) {
                let supported = await checkProtocolSupportAtPort(host, protocol, debugLogCallback);
                if (supported) {
                    supportedProtocols.push(protocol);
                }
            }
        }
        return supportedProtocols;
    }
}
