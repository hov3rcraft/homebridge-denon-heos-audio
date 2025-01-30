# Homebridge Denon Telnet & HeosCLI
This plugin uses telnet to control your Denon smart speakers, stereos, and AVRs. It can use the modern "HeosCLI" protocol, the classic "AVR control" telnet control protocol, or a combination of both. 

This plugin is especially useful for controlling smart speakers and stereos, which do not support HHTP commands on ports 80 and 8080 and therefore cannot use [homebridge-denon-tv](https://github.com/grzegorz914/homebridge-denon-tv).

At this point, only a small subset of features is implemented (see [Roadmap](#roadmap)). I am planning to continue development over 2025

## Supported Devices
This plugin should support any Denon smart speakers, stereos, and AVRs that support telnet and/or Heos. 

I use the following devices for testing:
- CEOL N10
- Home 250
- AVR X1600H

## Roadmap
- v0.2: Full control (via TV service) using the AVR control telnet protocol
- v0.3: Play/pause switch using the HeosCLI protocol
- v0.4: Full control (via TV service) using the HeosCLI protocol
- v0.5: Hybrid mode using the AVR control protocol for on/off and HeosCLI for the rest

### Other planned improvements
- device auto-discovery when IP is not static

## Resources
- [AVR Control Protocol Specification](https://assets.denon.com/documentmaster/uk/avr1713_avr1613_protocol_v860.pdf)
- [HEOS CLI Protocol Specification](https://rn.dmglobal.com/usmodel/HEOS_CLI_ProtocolSpecification-Version-1.17.pdf)
