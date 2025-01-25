import ssdp from '@achingbrain/ssdp';
import { Logger } from 'homebridge';

export async function discoverSsdpDevices(log: Logger) {
    const bus = await ssdp();

    let foundSerials = new Map<string, any>();

    for await (const service of bus.discover()) {
        const serial = service.details?.device?.serialNumber;

        if (!serial) {
            continue;
        }

        if (foundSerials.has(serial)) {
            continue;
        }
        foundSerials.set(serial, service);

        if (JSON.stringify(service).toLowerCase().includes("denon")) {
            log.success('---------------------------------------------------------');
            log.success('Found DENON device in local network:');
            log.success('Friendly name:', service.details?.device?.friendlyName);
            log.success('Model name:   ', service.details?.device?.modelName);
            log.success('Serial number:', serial);
            log.success('IP address:   ', service.location?.hostname);
            log.success('---------------------------------------------------------');
        }
    }
}
