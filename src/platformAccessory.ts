import type { CharacteristicValue, Logger, PlatformAccessory, Service } from 'homebridge';

import type { DenonTelnetPlatform } from './platform.js';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class DenonTelnetAccessory {
  private readonly platform: DenonTelnetPlatform;
  private readonly accessory: PlatformAccessory;
  private readonly log: Logger;

  private readonly name: string;

  /**
   * These are just used to create a working example
   * You should implement your own code to track the state of your accessory
   */
  private exampleStates = {
    On: false,
    Brightness: 100,
  };

  constructor(platform: DenonTelnetPlatform, accessory: PlatformAccessory, config: any, log: Logger) {
    log.debug('Initializing DenonTelnetAccessory...');

    this.platform = platform;
    this.accessory = accessory;
    this.log = log;

    this.name = accessory.displayName;

    this.log.info('Finished initializing accessory:', this.name);
  }

  /**
   * Handle the "GET" requests from HomeKit
   * These are sent when HomeKit wants to know the current state of the accessory, for example, checking if a Light bulb is on.
   */
  async getOn(): Promise<CharacteristicValue> {
    // implement your own code to check if the device is on
    const isOn = this.exampleStates.On;

    this.platform.log.debug('Get Characteristic On ->', isOn);

    // if you need to return an error to show the device as "Not Responding" in the Home app:
    // throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);

    return isOn;
  }

  /**
   * Handle "SET" requests from HomeKit
   * These are sent when the user changes the state of an accessory, for example, turning on a Light bulb.
   */
  async setOn(value: CharacteristicValue) {
    // implement your own code to turn your device on/off
    this.exampleStates.On = value as boolean;
  
    this.platform.log.debug('Set Characteristic On ->', value);
  }
}
