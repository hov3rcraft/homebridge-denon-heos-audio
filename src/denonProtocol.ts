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

    function checkProtocolSupportAtPort(host: string, port: number): Promise<boolean> {
        return new Promise((resolve, reject) => {
            const socket = net.connect(port, host, () => {
                resolve(true);
                socket.end();
            });

            socket.on('error', (err) => {
                resolve(false);
                socket.end();
            });

            socket.on('timeout', () => {
                resolve(false);
                socket.end();
            });

            socket.setTimeout(5000);

            setTimeout(() => {
                // if graceful termination has failed, destroy the socket.
                if (!socket.destroyed) {
                    console.log("destroying the socket", host, port);
                    socket.destroy();
                }
            }, 1000);
        });
    }

    export async function checkProtocolSupport(host: string): Promise<DenonProtocol[]> {
        let supportedProtocols = [];
        for (const protocol of Object.values(DenonProtocol).filter(value => typeof value === 'number')) {
            if (protocol >= 0) {
                let supported = await checkProtocolSupportAtPort(host, protocol);
                if (supported) {
                    supportedProtocols.push(protocol);
                }
            }
        }
        return supportedProtocols;
    }
}
