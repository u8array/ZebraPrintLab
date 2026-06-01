# ZPL Command Roadmap

What's supported, what's next, what's planned.

## Status legend

| Mark | Meaning |
|:-:|---|
| `[x]` | Supported in the current build |
| `[ ]` | Not yet supported; the **Bucket** column says when |

**Buckets** (for `[ ]` rows):

| Bucket | What it means |
|---|---|
| `Coming soon` | Next sweep of registry / parser work, no infrastructure dependency |
| `Native build` | Requires bidirectional printer connection (host queries, calibration feedback, RFID read, serial config); waits for Tauri |
| `Out of scope` | Intentionally not modelled (e.g. ^SO RTC offset, ~SE encoding-table tilde-form) — see related Modal-tab field for the supported alternative |

The Printer Settings Modal (Media & Feed / Print Quality / Clock & Time / Encoding & Language / Identity) is now shipped; commands that didn't make the first cut sit under `Coming soon` and slot into the existing tab UI without infrastructure work.

## Layout & flow

| Status | Command | Description | Bucket |
|:-:|---|---|---|
| `[x]` | `^XA` | start label | |
| `[x]` | `^XZ` | end label | |
| `[x]` | `^PW` | print width | |
| `[x]` | `^LL` | label length | |
| `[x]` | `^LH` | label home origin | |
| `[x]` | `^LS` | label shift | |
| `[x]` | `^LT` | label top offset | |
| `[x]` | `^MM` | print mode (tear off / peel / cutter) | |
| `[x]` | `^MT` | media type | |
| `[x]` | `^PQ` | print quantity | |
| `[x]` | `^LR` | label reverse | |
| `[x]` | `^PO` | print orientation | |
| `[x]` | `^PM` | print mirror | |
| `[x]` | `^PR` | print rate | |
| `[x]` | `^MD` | media darkness | |
| `[x]` | `~SD` | set darkness | |

## Fields

| Status | Command | Description | Bucket |
|:-:|---|---|---|
| `[x]` | `^FO` | field origin | |
| `[x]` | `^FT` | field top | |
| `[x]` | `^FD` | field data | |
| `[x]` | `^FS` | field separator | |
| `[x]` | `^FH` | field hex indicator | |
| `[x]` | `^FR` | field reverse | |
| `[x]` | `^FX` | field comment | |
| `[x]` | `^FW` | default field rotation | |
| `[x]` | `^FB` | multi line text block | |
| `[x]` | `^TB` | text block | |
| `[x]` | `^FN` | variable placeholder | |
| `[x]` | `^FV` | variable data | |
| `[x]` | `^FE` | field number embed character | |
| `[x]` | `^FC` | field clock (date / time) | |
| `[x]` | `^BY` | barcode field default | |
| `[ ]` | `^FM` | multiple field origins | `Coming soon` |
| `[ ]` | `^FP` | field path (text along path) | `Coming soon` |
| `[ ]` | `^CO` | font cache size | `Coming soon` |
| `[ ]` | `^CP` | change parser | `Coming soon` |
| `[ ]` | `^CV` | code validation | `Coming soon` |

## Text & fonts

| Status | Command | Description | Bucket |
|:-:|---|---|---|
| `[x]` | `^A0` | scalable font 0 | |
| `[x]` | `^A` | fonts A to Z, 0 to 9 (best effort sizing) | |
| `[x]` | `^A@` | TrueType reference | |
| `[x]` | `^CF` | change default font | |
| `[x]` | `^CI` | international encoding | |
| `[x]` | `^CW` | font alias (printer resident) | |
| `[ ]` | `^FL` | font linking | `Native build` |
| `[ ]` | `^LF` | list font links | `Native build` |
| `[ ]` | `~DB` | download bitmap font | `Native build` |
| `[ ]` | `~DS` | download scalable font | `Native build` |
| `[ ]` | `~DT` | download TrueType font | `Native build` |
| `[ ]` | `~DU` | download unbounded TrueType | `Native build` |
| `[ ]` | `~DE` | download encoding | `Native build` |
| `[ ]` | `~DN` | abort download | `Native build` |

## Barcodes

| Status | Command | Description | Bucket |
|:-:|---|---|---|
| `[x]` | `^BC` | Code 128 | |
| `[x]` | `^B3` | Code 39 | |
| `[x]` | `^BA` | Code 93 | |
| `[x]` | `^B1` | Code 11 | |
| `[x]` | `^B2` | Interleaved 2 of 5 | |
| `[x]` | `^BI` | Industrial 2 of 5 | |
| `[x]` | `^BJ` | Standard 2 of 5 | |
| `[x]` | `^BK` | ANSI Codabar | |
| `[x]` | `^BL` | LOGMARS | |
| `[x]` | `^BM` | MSI | |
| `[x]` | `^BP` | Plessey | |
| `[x]` | `^BE` | EAN 13 | |
| `[x]` | `^B8` | EAN 8 | |
| `[x]` | `^BU` | UPC A | |
| `[x]` | `^B9` | UPC E | |
| `[x]` | `^BR` | GS1 Databar | |
| `[x]` | `^B5` | Planet Code | |
| `[x]` | `^BZ` | POSTNET | |
| `[x]` | `^BS` | UPC / EAN 2 or 5 digit supplement | |
| `[x]` | `^B4` | Code 49 | |
| `[x]` | `^BQ` | QR Code | |
| `[x]` | `^BX` | DataMatrix | |
| `[x]` | `^B7` | PDF417 | |
| `[x]` | `^BF` | MicroPDF417 | |
| `[x]` | `^B0` / `^BO` | Aztec | |
| `[x]` | `^BB` | CODABLOCK F | |
| `[x]` | `^BV` | UPS MaxiCode (also accepts `^BD` on some firmware generations as an alias) | |
| `[ ]` | `^BT` | TLC39 | `Coming soon` |

## Graphics

| Status | Command | Description | Bucket |
|:-:|---|---|---|
| `[x]` | `^GB` | graphic box (also lines) | |
| `[x]` | `^GD` | diagonal line | |
| `[x]` | `^GE` | ellipse | |
| `[x]` | `^GC` | circle | |
| `[x]` | `^GF` | monochrome bitmap | |
| `[x]` | `^GS` | graphic symbol (printer resident chars) | |
| `[ ]` | `^IL` | image load | `Native build` |
| `[ ]` | `^IM` | image move | `Native build` |
| `[ ]` | `^ID` | image delete | `Native build` |
| `[ ]` | `^IS` | image save | `Native build` |
| `[ ]` | `~DG` | download graphic | `Native build` |
| `[ ]` | `~EG` | erase download graphics | `Native build` |

## Serialisation

| Status | Command | Description | Bucket |
|:-:|---|---|---|
| `[x]` | `^SN` | counter (post field) | |
| `[x]` | `^SF` | counter (pre field) | |

## Templates & variables

| Status | Command | Description | Bucket |
|:-:|---|---|---|
| `[x]` | `^DF` / `^DFR` | store template | |
| `[x]` | `^XF` / `^XFR` | recall template | |
| `[x]` | `^XG` | recall graphic | |
| `[x]` | `~DY` | download font / graphic | |

## Media & feed

| Status | Command | Description | Bucket |
|:-:|---|---|---|
| `[x]` | `^MN` | media tracking (web / mark / continuous) | |
| `[x]` | `^ML` | maximum label length | |
| `[x]` | `^MF` | media feed | |
| `[x]` | `^XB` | suppress backfeed | |
| `[ ]` | `^MA` | maintenance alert | `Coming soon` |
| `[ ]` | `^MC` | map clear | `Coming soon` |
| `[ ]` | `^MI` | maintenance info message | `Coming soon` |
| `[ ]` | `^MP` | mode protection | `Coming soon` |
| `[ ]` | `^MU` | units of measure | `Coming soon` |
| `[ ]` | `^MW` | head cold warning | `Coming soon` |

## Print quality

| Status | Command | Description | Bucket |
|:-:|---|---|---|
| `[x]` | `^JZ` | reprint after error | |
| `[x]` | `^JT` | head test interval | |
| `[x]` | `~TA` | tear off adjust | |
| `[ ]` | `^PA` | advanced text properties | `Coming soon` |
| `[ ]` | `^JH` | early warning settings | `Coming soon` |
| `[ ]` | `^PF` | slew dot rows | `Coming soon` |
| `[ ]` | `^PH` / `~PH` | slew to home | `Coming soon` |
| `[ ]` | `^PN` | present now | `Coming soon` |
| `[ ]` | `^PP` / `~PP` | programmable pause | `Coming soon` |
| `[ ]` | `~PR` | applicator reprint | `Coming soon` |
| `[ ]` | `~PS` | print start | `Coming soon` |
| `[ ]` | `~JS` | change backfeed sequence | `Coming soon` |
| `[ ]` | `^JW` | set ribbon tension | `Coming soon` |
| `[ ]` | `^JU` | configuration update | `Coming soon` |

## Clock & time

| Status | Command | Description | Bucket |
|:-:|---|---|---|
| `[x]` | `^ST` | set date & time (static + live-clock mode) | |
| `[x]` | `^KD` | date & time format | |
| `[ ]` | `^SO` | RTC offset | `Out of scope` |

## Encoding & language

| Status | Command | Description | Bucket |
|:-:|---|---|---|
| `[x]` | `^KL` | define language | |
| `[x]` | `^SE` | encoding table | |
| `[x]` | `^SZ` | set ZPL mode | |
| `[ ]` | `~SE` | encoding table (tilde-form, immediate) | `Out of scope` |

## Identity & access

| Status | Command | Description | Bucket |
|:-:|---|---|---|
| `[x]` | `^KN` | printer name + description | |
| `[x]` | `^SL` | clock mode (S / T / TOL) + language | |
| `[ ]` | `^KP` | set password | `Coming soon` |

## Configuration & persistence

| Status | Command | Description | Bucket |
|:-:|---|---|---|
| `[x]` | `^CC` / `~CC` | change caret | |
| `[x]` | `^CD` / `~CD` | change delimiter | |
| `[x]` | `^CT` / `~CT` | change tilde | |
| `[ ]` | `^CM` | change memory letter assignment | `Native build` |
| `[ ]` | `~KB` | kill battery | `Native build` |

## Hardware control & calibration

These need printer-side feedback or are intrinsically connection bound.

| Status | Command | Description | Bucket |
|:-:|---|---|---|
| `[ ]` | `~JA` | cancel all | `Native build` |
| `[ ]` | `^JB` / `~JB` | initialize flash / reset | `Native build` |
| `[ ]` | `~JC` | media sensor calibration | `Native build` |
| `[ ]` | `~JD` / `~JE` | enable / disable comm diagnostics | `Native build` |
| `[ ]` | `~JF` | set battery condition | `Native build` |
| `[ ]` | `~JG` | graphing sensor calibration | `Native build` |
| `[ ]` | `~JI` | start ZBI | `Native build` |
| `[ ]` | `^JJ` | set auxiliary port | `Native build` |
| `[ ]` | `~JL` | set label length | `Native build` |
| `[ ]` | `^JM` | set dots per millimeter | `Native build` |
| `[ ]` | `~JN` / `~JO` | head test fatal / non fatal | `Native build` |
| `[ ]` | `~JP` | pause and cancel format | `Native build` |
| `[ ]` | `~JQ` | terminate ZBI | `Native build` |
| `[ ]` | `~JR` | power on reset | `Native build` |
| `[ ]` | `~JX` | cancel partial format | `Native build` |
| `[ ]` | `~RO` | reset advanced counter | `Native build` |
| `[ ]` | `^SC` | set serial comm | `Native build` |
| `[ ]` | `^SI` | set sensor intensity | `Native build` |
| `[ ]` | `^SP` | start ZBI program | `Native build` |
| `[ ]` | `^SQ` | halt ZBI execution | `Native build` |
| `[ ]` | `^SR` | set printhead resistance | `Native build` |
| `[ ]` | `^SS` | set media sensors | `Native build` |
| `[ ]` | `^SX` | set ZebraNet alert | `Native build` |
| `[ ]` | `^TO` | transfer object | `Native build` |
| `[ ]` | `~WC` | print configuration label | `Native build` |
| `[ ]` | `^WD` | print directory label | `Native build` |
| `[ ]` | `~WQ` | write query | `Native build` |
| `[ ]` | `^WT` | write tag (RFID) | `Native build` |
| `[ ]` | `^XS` | set dynamic media calibration | `Native build` |
| `[ ]` | `^ZZ` | printer sleep | `Native build` |

## Host communication

| Status | Command | Description | Bucket |
|:-:|---|---|---|
| `[ ]` | `~HB` | battery status | `Native build` |
| `[ ]` | `~HD` | head diagnostic | `Native build` |
| `[ ]` | `^HF` | host format | `Native build` |
| `[ ]` | `^HG` | host graphic | `Native build` |
| `[ ]` | `^HH` | configuration label return | `Native build` |
| `[ ]` | `~HI` | host identification | `Native build` |
| `[ ]` | `~HM` | host RAM status | `Native build` |
| `[ ]` | `~HQ` | host query | `Native build` |
| `[ ]` | `~HS` | host status return | `Native build` |
| `[ ]` | `^HT` | host linked fonts list | `Native build` |
| `[ ]` | `~HU` | ZebraNet alert config | `Native build` |
| `[ ]` | `^HV` | host verification | `Native build` |
| `[ ]` | `^KV` | firmware version query | `Native build` |
| `[ ]` | `^HW` | host directory | `Native build` |
| `[ ]` | `^HY` | upload graphics | `Native build` |
| `[ ]` | `^HZ` | display description info | `Native build` |

## RFID

| Status | Command | Description | Bucket |
|:-:|---|---|---|
| `[ ]` | `^RF` | read / write RFID | `Native build` |
| `[ ]` | `^RI` | get tag ID | `Native build` |
| `[ ]` | `^RM` | enable motion | `Native build` |
| `[ ]` | `^RN` | detect multiple tags | `Native build` |
| `[ ]` | `^RQ` | quick write | `Native build` |
| `[ ]` | `^RR` | read timeout | `Native build` |
| `[ ]` | `^RS` | RFID setup | `Native build` |
| `[ ]` | `^RT` | read tag | `Native build` |
| `[ ]` | `^RU` | read UHF | `Native build` |
| `[ ]` | `^RV` | report encoding result | `Native build` |
| `[ ]` | `^RW` | set read & write power | `Native build` |
| `[ ]` | `^RZ` | set tag password | `Native build` |
| `[ ]` | `^HL` | RFID data log | `Native build` |

## Network

| Status | Command | Description | Bucket |
|:-:|---|---|---|
| `[ ]` | `^NB` | search network printer | `Native build` |
| `[ ]` | `^NC` / `~NC` | primary network device | `Native build` |
| `[ ]` | `^NI` | network ID | `Native build` |
| `[ ]` | `^NN` | set SNMP | `Native build` |
| `[ ]` | `^NP` | primary / backup device | `Native build` |
| `[ ]` | `~NR` | set all network printers transparent | `Native build` |
| `[ ]` | `~NT` | set SMTP | `Native build` |
| `[ ]` | `^NW` | web auth timeout | `Native build` |
