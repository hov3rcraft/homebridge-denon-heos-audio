import type { CharacteristicValue, Logger, PlatformAccessory, Service } from "homebridge";

import type { DenonAudioPlatform } from "./platform.js";

import { DOMParser } from "@xmldom/xmldom";
import { PromiseTimeoutException } from "./promiseTimeoutException.js";
import { IDenonClient, Playing, RaceStatus } from "./denonClient.js";
import * as DenonProtocol from "./denonProtocol.js";
import * as CustomLogging from "./customLogging.js";

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class DenonAudioAccessory {
  private static readonly CALLBACK_TIMEOUT = 1500;
  private static readonly API_CONNECT_TIMEOUT = 5 * 1000;
  private static readonly API_RESPONSE_TIMEOUT = 1 * 1000;

  private readonly platform: DenonAudioPlatform;
  private readonly accessory: PlatformAccessory;
  private readonly denonClient: IDenonClient;
  private readonly informationService: Service;
  private readonly tvService: Service;
  private readonly speakerService: Service;
  private readonly rawLog: Logger;
  private readonly log: Logger;

  private readonly name: string;
  private readonly ip: string;
  private readonly serialNumber: string;
  private readonly controlMode: DenonProtocol.ControlMode;
  private readonly volumeStepSize: number;
  private readonly volumeLimit: number | undefined;

  private lastSetVolume: number | undefined;
  private targetMediaState: CharacteristicValue | undefined;

  private volumeChangeOngoing = false;
  private playingChangeOngoing = false;

  constructor(platform: DenonAudioPlatform, accessory: PlatformAccessory, config: any, log: Logger) {
    log.debug("Initializing DenonAudioAccessory...");

    this.platform = platform;
    this.accessory = accessory;
    this.rawLog = log;
    this.log = new CustomLogging.LoggerPrefixWrapper(this.rawLog, accessory.displayName);

    this.name = accessory.displayName;
    this.ip = config.ip;
    this.serialNumber = config.serialNumber;
    this.controlMode = DenonProtocol.ControlMode[config.controlProtocol as keyof typeof DenonProtocol.ControlMode] as DenonProtocol.ControlMode;

    if (config.volumeLimitEnabled && (config.volumeLimit < 0 || config.volumeLimit > 99)) {
      throw new Error("Volume limit must be between 0 and 99");
    }
    this.volumeLimit = config.volumeLimitEnabled ? config.volumeLimit : undefined;

    if (config.volumeStepSize < 1 || config.volumeStepSize > 10) {
      throw new Error("Volume step size must be between 1 and 10");
    }
    this.volumeStepSize = config.volumeStepSize;

    // set accessory category
    accessory.category = this.platform.api.hap.Categories.TELEVISION;

    // add information service
    this.informationService = this.accessory.getService(this.platform.Service.AccessoryInformation)!;
    this.informationService.getCharacteristic(this.platform.Characteristic.Identify).onSet(this.setIdentify.bind(this));
    this.informationService.setCharacteristic(this.platform.Characteristic.Name, this.name);
    this.informationService.setCharacteristic(this.platform.Characteristic.SerialNumber, this.serialNumber);
    this.informationService.setCharacteristic(this.platform.Characteristic.Manufacturer, "unknown");
    this.informationService.setCharacteristic(this.platform.Characteristic.Model, "unknown");
    this.informationService.setCharacteristic(this.platform.Characteristic.FirmwareRevision, "unknown");
    this.fetchMetadataAios();

    // add tv service
    this.tvService = this.accessory.getService(`${this.name} TV`) || this.accessory.addService(this.platform.Service.Television, `${this.name} TV`);
    this.tvService.setCharacteristic(this.platform.Characteristic.ConfiguredName, this.name);
    this.tvService.setCharacteristic(this.platform.Characteristic.SleepDiscoveryMode, this.platform.Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);
    this.tvService.getCharacteristic(this.platform.Characteristic.Active).onGet(this.getActive.bind(this)).onSet(this.setActive.bind(this));
    this.tvService
      .getCharacteristic(this.platform.Characteristic.ActiveIdentifier)
      .onGet(this.getActiveIdentifier.bind(this))
      .onSet(this.setActiveIdentifier.bind(this));
    if (this.controlMode !== DenonProtocol.ControlMode.AVRCONTROL) {
      this.tvService.getCharacteristic(this.platform.Characteristic.CurrentMediaState).onGet(this.getCurrentMediaState.bind(this));
      this.tvService
        .getCharacteristic(this.platform.Characteristic.TargetMediaState)
        .onGet(this.getTargetMediaState.bind(this))
        .onSet(this.setTargetMediaState.bind(this));
    }
    this.tvService.getCharacteristic(this.platform.Characteristic.RemoteKey).onSet(this.setRemoteKey.bind(this));

    // add speaker service
    this.speakerService =
      this.accessory.getService(`${this.name} Speaker`) || this.accessory.addService(this.platform.Service.TelevisionSpeaker, `${this.name} Speaker`);
    this.speakerService.getCharacteristic(this.platform.Characteristic.Mute).onGet(this.getMute.bind(this)).onSet(this.setMute.bind(this));
    this.speakerService.getCharacteristic(this.platform.Characteristic.Volume).onGet(this.getVolume.bind(this)).onSet(this.setVolume.bind(this));
    this.speakerService.getCharacteristic(this.platform.Characteristic.VolumeSelector).onSet(this.setVolumeSelector.bind(this));
    this.speakerService.setCharacteristic(this.platform.Characteristic.VolumeControlType, this.platform.Characteristic.VolumeControlType.ABSOLUTE);

    // choose appropriate client
    this.denonClient = new DenonProtocol.CLIENT_MAP[this.controlMode](
      this.serialNumber,
      this.ip,
      DenonAudioAccessory.API_CONNECT_TIMEOUT,
      DenonAudioAccessory.API_RESPONSE_TIMEOUT,
      this.log.debug.bind(this.log),
      this.callbackActive.bind(this),
      this.callbackMute.bind(this),
      this.callbackVolume.bind(this)
    );

    this.log.info("Finished initializing accessory.");
  }

  private fetchMetadataAios() {
    fetch(`http://${this.ip}:60006/upnp/desc/aios_device/aios_device.xml`)
      .then((response) => {
        if (!response.ok) {
          this.log.debug(`Received a non-200 status code while connecting to a new device's location href (status code: ${response.status}).`);
        }

        response.text().then((text) => {
          const parser = new DOMParser();
          const xmlDoc = parser.parseFromString(text, "text/xml");

          this.informationService.setCharacteristic(
            this.platform.Characteristic.Manufacturer,
            xmlDoc.getElementsByTagName("device")[0]?.getElementsByTagName("manufacturer")[0]?.textContent || "unknown"
          );
          this.informationService.setCharacteristic(
            this.platform.Characteristic.Model,
            xmlDoc.getElementsByTagName("device")[0]?.getElementsByTagName("modelName")[0]?.textContent || "unknown"
          );

          const d_list = xmlDoc.getElementsByTagName("device")[0]?.getElementsByTagName("deviceList")[0]?.getElementsByTagName("device") || [];
          for (const d of d_list) {
            const firmware_version = d.getElementsByTagName("firmware_version")[0]?.textContent;
            if (firmware_version) {
              this.informationService.setCharacteristic(this.platform.Characteristic.FirmwareRevision, firmware_version || "unknown");
              break;
            }
          }
        });
      })
      .catch(() => {
        this.log.warn(`An error occured while connecting to ${this.name}'s location href.`);
      });
  }

  /**
   * Handle the "GET" requests from HomeKit
   * These are sent when HomeKit wants to know the current state of the accessory, for example, checking if a Light bulb is on.
   */
  async getActive(): Promise<CharacteristicValue> {
    const raceStatus = new RaceStatus();
    this.log.debug(`getPower for ${this.name}. [race id: ${raceStatus.raceId}]`);

    try {
      return await Promise.race([
        this.denonClient.getPower(raceStatus),
        new Promise<boolean>((resolve, reject) => {
          setTimeout(() => {
            raceStatus.setRaceOver();
            reject(new PromiseTimeoutException(DenonAudioAccessory.CALLBACK_TIMEOUT));
          }, DenonAudioAccessory.CALLBACK_TIMEOUT);
        }),
      ]);
    } catch (error) {
      if (error instanceof PromiseTimeoutException) {
        this.log.debug(`${this.name} lost its promise race for getOn(). [race id: ${raceStatus.raceId}]`);
      } else {
        this.log.error(`An error occured while getting power status for ${this.name}. [race id: ${raceStatus.raceId}]`, error);
      }
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }

  async getActiveIdentifier(): Promise<CharacteristicValue> {
    // TODO - related to input sources
    return 1;
  }

  private async getPlaying(raceStatus: RaceStatus): Promise<Playing> {
    try {
      return await Promise.race([
        this.denonClient.getPlaying(raceStatus),
        new Promise<Playing>((resolve, reject) => {
          setTimeout(() => {
            raceStatus.setRaceOver();
            reject(new PromiseTimeoutException(DenonAudioAccessory.CALLBACK_TIMEOUT));
          }, DenonAudioAccessory.CALLBACK_TIMEOUT);
        }),
      ]);
    } catch (error) {
      if (error instanceof PromiseTimeoutException) {
        this.log.debug(`${this.name} lost its promise race for getPlaying(). [race id: ${raceStatus.raceId}]`);
      } else {
        this.log.error(`An error occured while getting playing status for ${this.name}. [race id: ${raceStatus.raceId}]`, error);
      }
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }

  async getCurrentMediaState(): Promise<CharacteristicValue> {
    const raceStatus = new RaceStatus();
    this.log.debug(`getCurrentMediaState for ${this.name}. [race id: ${raceStatus.raceId}]`);
    const playing = await this.getPlaying(raceStatus);
    switch (playing) {
      case Playing.PLAY:
        return this.platform.Characteristic.CurrentMediaState.PLAY;
      case Playing.PAUSE:
        return this.platform.Characteristic.CurrentMediaState.PAUSE;
      case Playing.STOP:
      case Playing.UNSUPPORTED:
        return this.platform.Characteristic.CurrentMediaState.STOP;
    }
  }

  async getTargetMediaState(): Promise<CharacteristicValue> {
    if (this.targetMediaState) {
      this.log.debug(`getTargetMediaState for ${this.name}. [retrieving from cache]`);
      return this.targetMediaState;
    } else {
      const raceStatus = new RaceStatus();
      this.log.debug(`getTargetMediaState for ${this.name}. [race id: ${raceStatus.raceId}]`);
      const playing = await this.getPlaying(raceStatus);
      switch (playing) {
        case Playing.PLAY:
          return this.platform.Characteristic.TargetMediaState.PLAY;
        case Playing.PAUSE:
          return this.platform.Characteristic.TargetMediaState.PAUSE;
        case Playing.STOP:
        case Playing.UNSUPPORTED:
          return this.platform.Characteristic.TargetMediaState.STOP;
      }
    }
  }

  async getMute(): Promise<CharacteristicValue> {
    const raceStatus = new RaceStatus();
    this.log.debug(`getMute for ${this.name}. [race id: ${raceStatus.raceId}]`);

    try {
      return await Promise.race([
        this.denonClient.getMute(raceStatus),
        new Promise<boolean>((resolve, reject) => {
          setTimeout(() => {
            raceStatus.setRaceOver();
            reject(new PromiseTimeoutException(DenonAudioAccessory.CALLBACK_TIMEOUT));
          }, DenonAudioAccessory.CALLBACK_TIMEOUT);
        }),
      ]);
    } catch (error) {
      if (error instanceof PromiseTimeoutException) {
        this.log.debug(`${this.name} lost its promise race for getMute(). [race id: ${raceStatus.raceId}]`);
      } else {
        this.log.error(`An error occured while getting mute status for ${this.name}. [race id: ${raceStatus.raceId}]`, error);
      }
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }

  async getVolume(): Promise<CharacteristicValue> {
    const raceStatus = new RaceStatus();
    this.log.debug(`getVolume for ${this.name}. [race id: ${raceStatus.raceId}]`);

    try {
      const volume = await Promise.race([
        this.denonClient.getVolume(raceStatus),
        new Promise<number>((resolve, reject) => {
          setTimeout(() => {
            raceStatus.setRaceOver();
            reject(new PromiseTimeoutException(DenonAudioAccessory.CALLBACK_TIMEOUT));
          }, DenonAudioAccessory.CALLBACK_TIMEOUT);
        }),
      ]);
      return this.adjustBackFromVolumeLimit(volume);
    } catch (error) {
      if (error instanceof PromiseTimeoutException) {
        this.log.debug(`${this.name} lost its promise race for getVolume(). [race id: ${raceStatus.raceId}]`);
      } else {
        this.log.error(`An error occured while getting volume for ${this.name}. [race id: ${raceStatus.raceId}]`, error);
      }
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }

  /*
   * Handle "SET" requests from HomeKit
   * These are sent when the user changes the state of an accessory, for example, turning on a Light bulb.
   */
  setIdentify(value: any) {
    this.log.info("Triggered SET Identify:", value);
  }

  setActive(newValue: CharacteristicValue) {
    this.log.debug(`setActive for ${this.name} set to ${newValue}`);
    this.denonClient.setPower(newValue as boolean).catch((error) => {
      this.log.error(`An error occured while setting power status for ${this.name}.`, error);
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    });
  }

  setActiveIdentifier(newValue: CharacteristicValue) {
    this.log.debug(`setActiveIdentifier for ${this.name} set to ${newValue}`);
    // TODO - related to input sources
  }

  setRemoteKey(remoteKey: CharacteristicValue) {
    switch (remoteKey) {
      case this.platform.Characteristic.RemoteKey.REWIND: {
        // unsupported in iOS
        break;
      }
      case this.platform.Characteristic.RemoteKey.FAST_FORWARD: {
        // unsupported in iOS
        break;
      }
      case this.platform.Characteristic.RemoteKey.NEXT_TRACK: {
        // unsupported in iOS
        this.setPlayNext();
        break;
      }
      case this.platform.Characteristic.RemoteKey.PREVIOUS_TRACK: {
        // unsupported in iOS
        this.setPlayPrevious();
        break;
      }
      case this.platform.Characteristic.RemoteKey.ARROW_UP: {
        break;
      }
      case this.platform.Characteristic.RemoteKey.ARROW_DOWN: {
        break;
      }
      case this.platform.Characteristic.RemoteKey.ARROW_LEFT: {
        this.setPlayPrevious();
        break;
      }
      case this.platform.Characteristic.RemoteKey.ARROW_RIGHT: {
        this.setPlayNext();
        break;
      }
      case this.platform.Characteristic.RemoteKey.SELECT: {
        this.setPlayPauseToggle();
        break;
      }
      case this.platform.Characteristic.RemoteKey.BACK: {
        // unsupported in iOS
        break;
      }
      case this.platform.Characteristic.RemoteKey.EXIT: {
        // unsupported in iOS
        break;
      }
      case this.platform.Characteristic.RemoteKey.PLAY_PAUSE: {
        this.setPlayPauseToggle();
        break;
      }
      case this.platform.Characteristic.RemoteKey.INFORMATION: {
        break;
      }
    }
  }

  async setTargetMediaState(newValue: CharacteristicValue) {
    this.log.debug(`setTargetMediaState for ${this.name} set to ${newValue}`);
    if (this.playingChangeOngoing) {
      this.log.debug(`setPlayPauseToggle for ${this.name} was called while another play state change is still ongoing. Ignoring this call.`);
      return;
    }

    this.playingChangeOngoing = true;
    switch (newValue) {
      case this.platform.Characteristic.TargetMediaState.PLAY:
        this.targetMediaState = Playing.PLAY;
        break;
      case this.platform.Characteristic.TargetMediaState.PAUSE:
        this.targetMediaState = Playing.PAUSE;
        break;
      case this.platform.Characteristic.TargetMediaState.STOP:
        this.targetMediaState = Playing.STOP;
        break;
      default:
        throw new Error(`Unexpected target media state: ${newValue}`);
    }

    try {
      await this.denonClient.setPlaying(this.targetMediaState);
    } catch (error) {
      this.log.error(`An error occured while setting mute status for ${this.name}.`, error);
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    } finally {
      this.targetMediaState = undefined;
      this.playingChangeOngoing = false;
    }
  }

  async setPlayPauseToggle() {
    const raceStatus = new RaceStatus();
    this.log.debug(`setPlayPauseToggle for ${this.name} [race id: ${raceStatus.raceId}]`);
    if (this.playingChangeOngoing) {
      this.log.debug(`setPlayPauseToggle for ${this.name} was called while another play state change is still ongoing. Ignoring this call.`);
      return;
    }

    try {
      this.playingChangeOngoing = true;
      const currentPlaying = await this.getPlaying(raceStatus);
      switch (currentPlaying) {
        case Playing.PLAY:
          this.targetMediaState = Playing.PAUSE;
          break;
        case Playing.PAUSE:
        case Playing.STOP:
          this.targetMediaState = Playing.PLAY;
          break;
        case Playing.UNSUPPORTED:
          return;
      }
      await this.denonClient.setPlaying(this.targetMediaState);
    } catch (error) {
      this.log.error(`An error occured while toggling play/pause for ${this.name}.`, error);
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    } finally {
      this.targetMediaState = undefined;
      this.playingChangeOngoing = false;
    }
  }

  setPlayNext() {
    this.log.debug(`setPlayNext for ${this.name}`);
    this.denonClient.setPlayNext().catch((error) => {
      this.log.error(`An error occured while setting play next for ${this.name}.`, error);
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    });
  }

  setPlayPrevious() {
    this.log.debug(`setPlayPrevious for ${this.name}`);
    this.denonClient.setPlayPrevious().catch((error) => {
      this.log.error(`An error occured while setting play previous for ${this.name}.`, error);
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    });
  }

  setMute(newValue: CharacteristicValue) {
    this.log.debug(`setMute for ${this.name} set to ${newValue}`);
    this.denonClient.setMute(newValue as boolean).catch((error) => {
      this.log.error(`An error occured while setting mute status for ${this.name}.`, error);
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    });
  }

  async setVolume(newValue: CharacteristicValue) {
    this.log.debug(`setVolume for ${this.name} set to ${newValue}`);
    if (this.volumeChangeOngoing) {
      this.log.debug(`setVolume for ${this.name} was called while another volume change is still ongoing. Ignoring this call.`);
      return;
    }

    try {
      this.volumeChangeOngoing = true;
      this.log.debug(`setVolume for ${this.name} set to ${newValue}`);
      this.lastSetVolume = newValue as number;
      const volumetoSet = this.adjustToVolumeLimit(newValue as number);
      this.denonClient.setVolume(volumetoSet);
    } catch (error) {
      this.log.error(`An error occured while setting volume for ${this.name}.`, error);
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    } finally {
      this.volumeChangeOngoing = false;
    }
  }

  async setVolumeSelector(direction: CharacteristicValue) {
    if (this.volumeChangeOngoing) {
      this.log.debug(`setVolumeSelector for ${this.name} was called while another volume change is still ongoing. Ignoring this call.`);
      return;
    }

    try {
      this.volumeChangeOngoing = true;
      this.log.debug(`setVolumeSelector for ${this.name} set to ${direction}`);
      if (direction === this.platform.Characteristic.VolumeSelector.INCREMENT) {
        if (this.volumeLimit) {
          const current_volume_device = await this.denonClient.getVolume();
          if (this.volumeLimit - current_volume_device <= 0) {
            // do nothing - volume limit reached
          } else if (this.volumeLimit - current_volume_device < this.volumeStepSize) {
            await this.denonClient.setVolumeUp(this.volumeLimit - current_volume_device);
          } else {
            await this.denonClient.setVolumeUp(this.volumeStepSize);
          }
        } else {
          await this.denonClient.setVolumeUp(this.volumeStepSize);
        }
      } else if (direction === this.platform.Characteristic.VolumeSelector.DECREMENT) {
        await this.denonClient.setVolumeDown(this.volumeStepSize);
      }
    } catch (error) {
      this.log.error(`An error occured while decrementing volume for ${this.name}.`, error);
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    } finally {
      this.volumeChangeOngoing = false;
    }
  }

  /*
   * Handles characteristic updates from the API
   */
  private callbackActive(active: boolean) {
    this.tvService.updateCharacteristic(this.platform.Characteristic.Active, active);
  }

  private callbackMute(mute: boolean) {
    this.speakerService.updateCharacteristic(this.platform.Characteristic.Mute, mute);
  }

  private callbackVolume(volume: number) {
    this.speakerService.updateCharacteristic(this.platform.Characteristic.Volume, this.adjustBackFromVolumeLimit(volume));
  }

  /*
   * Volume Limit Helpers
   */
  private adjustToVolumeLimit(volume: number) {
    if (this.volumeLimit) {
      return Math.round((volume * this.volumeLimit) / 100);
    } else {
      return volume;
    }
  }

  private adjustBackFromVolumeLimit(volume: number) {
    if (this.volumeLimit) {
      if (this.lastSetVolume && this.adjustToVolumeLimit(this.lastSetVolume) === volume) {
        return this.lastSetVolume;
      } else {
        return Math.round((volume / this.volumeLimit) * 100);
      }
    } else {
      return volume;
    }
  }
}
