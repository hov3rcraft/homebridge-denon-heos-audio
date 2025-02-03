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
                socket.end();
                resolve(true);
            });

            socket.on('error', (err) => {
                resolve(false);
            });

            socket.on('timeout', () => {
                socket.end();
                resolve(false);
            });

            socket.setTimeout(5000);
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
