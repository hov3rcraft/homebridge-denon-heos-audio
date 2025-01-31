# Homebridge Denon Telnet & HeosCLI
This plugin uses telnet to control your Denon smart speakers, stereos, and AVRs. It can use the modern "HeosCLI" protocol, the classic "AVR control" telnet control protocol, or a combination of both. 

This plugin is especially useful for controlling smart speakers and stereos, which do not support HHTP commands on ports 80 and 8080 and therefore cannot use [homebridge-denon-tv](https://github.com/grzegorz914/homebridge-denon-tv).

## Pre-Release
This is an early pre-release with only a small subset of features currently implemented (see [Roadmap](#roadmap)). Currently, there is only a switch for turning the devices on and off. I am planning to continue development over the course of 2025.

## Supported Devices
This plugin should support any Denon smart speakers, stereos, and AVRs that support telnet and/or Heos. 

I am using the following devices for testing:
- Denon CEOL N10
- Denon Home 250
- Denon AVR X1600H

## Roadmap
- v0.2: Play/pause switch using the HeosCLI protocol
- v0.3: Full control (via TV service) using the AVR control telnet protocol
- v0.4: Full control (via TV service) using the HeosCLI protocol and hybrid mode

### Other planned improvements
- device auto-discovery when IP is not static and/or control mode is not set

## Resources
- [AVR Control Protocol Specification](https://assets.denon.com/documentmaster/uk/avr1713_avr1613_protocol_v860.pdf)
- [HEOS CLI Protocol Specification](https://rn.dmglobal.com/usmodel/HEOS_CLI_ProtocolSpecification-Version-1.17.pdf)
