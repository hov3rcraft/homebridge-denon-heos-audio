import type { API, Characteristic, DynamicPlatformPlugin, Logger, LogLevel, PlatformAccessory, PlatformConfig, Service } from 'homebridge';
import ssdp from '@achingbrain/ssdp';

import { DenonTelnetAccessory } from './platformAccessory.js';
import { ConsoleLogger } from './consoleLogger.js';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';
import { checkTelnetSupport, DenonTelnetMode } from './denonTelnetClient.js';

export class DenonTelnetPlatform implements DynamicPlatformPlugin {
  public readonly log: Logger
  public readonly config: PlatformConfig
  public readonly api: API

  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: Map<string, PlatformAccessory> = new Map();
  public readonly ssdpDiscoveredDevices = new Map<string, any>();

  constructor(log: Logger, config: PlatformConfig, api: API,) {
    this.log = config.consoleLogEnabled ? new ConsoleLogger(ConsoleLogger.logLevelFromString[config.consoleLogLevel], "homebridge-eufy-robovac:") : log;
    this.config = config;
    this.api = api;

    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;

    this.log.debug('Finished initializing platform:', this.config.name);

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback');
      // run the method to discover / register your devices as accessories
      this.discoverDevices();
    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to set up event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache, so we can track if it has already been registered
    this.accessories.set(accessory.UUID, accessory);
  }

  discoverDevices() {
    if (this.config.deviceDiscovery) {
      this.discoverSsdpDevices(this.log);
    }

    let existingAccessoriesUuids = Array.from(this.accessories.keys());

    // loop over the configured devices and register each one if it has not already been registered
    for (const deviceConfig of this.config.devices) {

      // generate a unique id for the accessory this should be generated from something globally unique, 
      // but constant, for example, the device serial number or MAC address
      const uuid = this.api.hap.uuid.generate(deviceConfig.serialNumber);

      // see if an accessory with the same uuid has already been registered and restored from
      // the cached devices we stored in the `configureAccessory` method above
      const existingAccessory = this.accessories.get(uuid);

      if (existingAccessory) {
        // the accessory already exists
        this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

        // create the accessory handler for the restored accessory
        new DenonTelnetAccessory(this, existingAccessory, deviceConfig, this.log);

        // after it has been restored, the existing accessory should be removed form the uuid list
        existingAccessoriesUuids = existingAccessoriesUuids.filter(uuid => uuid !== existingAccessory.UUID);
      } else {
        // the accessory does not yet exist, so we need to create it
        this.log.info('Adding new accessory:', deviceConfig.name);

        // create a new accessory
        const accessory = new this.api.platformAccessory(deviceConfig.name, uuid);

        // store a copy of the device object in the `accessory.context`
        // the `context` property can be used to store any data about the accessory you may need
        accessory.context.device = deviceConfig;

        // create the accessory handler for the newly create accessory
        new DenonTelnetAccessory(this, accessory, deviceConfig, this.log);

        // link the accessory to your platform
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }

    // remove platform accessories from cache when no longer present
    for (const uuid of existingAccessoriesUuids) {
      const existingAccessory = this.accessories.get(uuid);
      if (existingAccessory) {
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
        this.log.info('Removing existing accessory from cache:', existingAccessory.displayName);
      }
    }
  }

  async discoverSsdpDevices(log: Logger) {
    const bus = await ssdp();

    for await (const service of bus.discover()) {
      const serial = service.details?.device?.serialNumber;

      if (!serial) {
        continue;
      }

      if (this.ssdpDiscoveredDevices.has(serial)) {
        continue;
      }

      this.ssdpDiscoveredDevices.set(serial, service);

      if (!JSON.stringify(service).toLowerCase().includes("denon")) {
        continue;
      }

      if (!service.location.href) {
        continue;
      }

      try {
        const response = await fetch(service.location.href);
        if (!response.ok) {
          log.debug(`Received a non-200 status code while connecting to a new device's location href (status code: ${response.status}).`);
          continue;
        }
      } catch (error) {
        log.debug("An error occured while connecting to a new device's location href.", error);
        continue;
      }

      log.debug('Checking telnet support for:', service.location.hostname);
      const supportedModes = await checkTelnetSupport(service.location.hostname);
      if (supportedModes.length === 0) {
        continue;
      }

      log.success('---------------------------------------------------------');
      log.success('Found DENON device in local network:');
      log.success('Friendly name:', service.details?.device?.friendlyName);
      log.success('Model name:   ', service.details?.device?.modelName);
      log.success('Serial number:', serial);
      log.success('IP address:   ', service.location.hostname);
      log.success('Supported modes:', supportedModes.map(mode => DenonTelnetMode[mode]).join(', '));
      log.success('---------------------------------------------------------');
    }
  }
}
