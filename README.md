# Homebridge Denon Heos Audio

This plugin controls your Denon smart speakers, stereos, and AVRs. It can use the modern "HeosCLI" protocol, the classic "AVR control" protocol, or a combination of both.

This plugin is especially useful for controlling smart speakers and stereos, which do not support HHTP commands on ports 80 and 8080 and therefore cannot use [homebridge-denon-tv](https://github.com/grzegorz914/homebridge-denon-tv).

## Pre-Release

This is an early pre-release with only a small subset of features currently implemented (see [Roadmap](#roadmap)). Currently, there is only a switch for turning the devices on and off. I am planning to continue development over the course of 2025.

Please only install the plugin at this point if you are willing to live with a few bugs and crashes. Running it on a child bridge is highly recommended.

Bug reports and feature suggestions are welcome, please head to the [issues](https://github.com/hov3rcraft/homebridge-denon-heos-audio/issues) page!

## Supported Devices

This plugin should support any Denon smart speakers, stereos, and AVRs that support AVR control and/or Heos.

I am using the following devices for testing:

- Denon CEOL N10
- Denon Home 250
- Denon AVR X1600H

## Roadmap

- v0.2: Play/pause switch using the HeosCLI protocol
- v0.3: TV service instead of switch
  - v0.3.1: Volume control and volume limit
  - v0.3.2: Media states
  - v0.3.3: Playback control using remote
- v0.4: Input selection

### Other planned improvements

- robust handling of offline devices and disconnected devices
- device auto-discovery when IP is not static and/or control protocol is not set

## Resources

- [AVR Control Protocol Specification](https://assets.denon.com/documentmaster/uk/avr1713_avr1613_protocol_v860.pdf)
- [HEOS CLI Protocol Specification](https://rn.dmglobal.com/usmodel/HEOS_CLI_ProtocolSpecification-Version-1.17.pdf)
