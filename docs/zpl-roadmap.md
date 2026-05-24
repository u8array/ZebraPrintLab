# ZPL Command Roadmap

What's supported, what's next, what's planned.

---

## Supported

### Layout & flow

- [x] `^XA` — start label
- [x] `^XZ` — end label
- [x] `^PW` — print width
- [x] `^LL` — label length
- [x] `^LH` — label home origin
- [x] `^LS` — label shift
- [x] `^LT` — label top offset
- [x] `^MM` — print mode (tear-off / peel / cutter)
- [x] `^MT` — media type
- [x] `^PQ` — print quantity
- [x] `^LR` — label reverse
- [x] `^PO` — print orientation
- [x] `^PM` — print mirror
- [x] `^PR` — print rate
- [x] `^MD` — media darkness
- [x] `~SD` — set darkness

### Fields

- [x] `^FO` — field origin
- [x] `^FT` — field top
- [x] `^FD` — field data
- [x] `^FS` — field separator
- [x] `^FH` — field hex indicator
- [x] `^FR` — field reverse
- [x] `^FX` — field comment
- [x] `^FW` — default field rotation
- [x] `^FB` — multi-line text block
- [x] `^TB` — text block
- [x] `^FN` — variable placeholder
- [x] `^FV` — variable data
- [x] `^FE` — field-number embed character
- [x] `^FC` — field clock (date / time)
- [x] `^BY` — barcode field default

### Text & fonts

- [x] `^A0` — scalable font 0
- [x] `^A` — fonts A-Z, 0-9 (best-effort sizing)
- [x] `^A@` — TrueType reference
- [x] `^CF` — change default font
- [x] `^CI` — international encoding

### Barcodes

- [x] `^BC` — Code 128
- [x] `^B3` — Code 39
- [x] `^BA` — Code 93
- [x] `^B1` — Code 11
- [x] `^B2` — Interleaved 2 of 5
- [x] `^BI` — Industrial 2 of 5
- [x] `^BJ` — Standard 2 of 5
- [x] `^BK` — ANSI Codabar
- [x] `^BL` — LOGMARS
- [x] `^BM` — MSI
- [x] `^BP` — Plessey
- [x] `^BE` — EAN-13
- [x] `^B8` — EAN-8
- [x] `^BU` — UPC-A
- [x] `^B9` — UPC-E
- [x] `^BR` — GS1 Databar
- [x] `^B5` — Planet Code
- [x] `^BZ` — POSTNET
- [x] `^BS` — UPC/EAN 2- or 5-digit supplement
- [x] `^B4` — Code 49
- [x] `^BQ` — QR Code
- [x] `^BX` — DataMatrix
- [x] `^B7` — PDF417
- [x] `^BF` — MicroPDF417
- [x] `^B0` / `^BO` — Aztec
- [x] `^BB` — CODABLOCK F

### Graphics

- [x] `^GB` — graphic box (also lines)
- [x] `^GD` — diagonal line
- [x] `^GE` — ellipse
- [x] `^GC` — circle
- [x] `^GF` — monochrome bitmap

### Serialisation

- [x] `^SN` — counter (post-field)
- [x] `^SF` — counter (pre-field)

### Templates & variables

- [x] `^DF` / `^DFR` — store template
- [x] `^XF` / `^XFR` — recall template
- [x] `^XG` — recall graphic
- [x] `~DY` — download font / graphic

---

## Coming soon

### Fields

- [ ] `^FM` — multiple field origins
- [ ] `^FP` — field path (text along path)
- [ ] `^CO` — font cache size
- [ ] `^CP` — change parser
- [ ] `^CV` — code validation

### Barcodes

- [ ] `^BD` — UPS MaxiCode
- [ ] `^BT` — TLC39

---

## Planned

Coming with a future native build.

### Printer-resident graphics & fonts

- [ ] `^GS` — graphic symbol (printer-resident chars)
- [ ] `^IL` — image load
- [ ] `^IM` — image move
- [ ] `^ID` — image delete
- [ ] `^IS` — image save
- [ ] `~DG` — download graphic
- [ ] `~EG` — erase download graphics
- [ ] `^CW` — font alias (printer-resident)
- [ ] `^FL` — font linking
- [ ] `^LF` — list font links
- [ ] `~DB` — download bitmap font
- [ ] `~DS` — download scalable font
- [ ] `~DT` — download TrueType font
- [ ] `~DU` — download unbounded TrueType
- [ ] `~DE` — download encoding
- [ ] `~DN` — abort download

### Real-time data

- [ ] `^SO` — RTC offset
- [ ] `^ST` — set date & time

### Hardware control & calibration

- [ ] `^MA` — maintenance alert
- [ ] `^MC` — map clear
- [ ] `^MI` — maintenance info message
- [ ] `^ML` — maximum label length
- [ ] `^MN` — media tracking (web / mark / continuous)
- [ ] `^MP` — mode protection
- [ ] `^MU` — units of measure
- [ ] `^MW` — head cold warning
- [ ] `^MF` — media feed
- [ ] `^PA` — advanced text properties
- [ ] `^PF` — slew dot rows
- [ ] `^PH` / `~PH` — slew to home
- [ ] `^PN` — present now
- [ ] `^PP` / `~PP` — programmable pause
- [ ] `~PR` — applicator reprint
- [ ] `~PS` — print start
- [ ] `~JA` — cancel all
- [ ] `^JB` / `~JB` — initialize flash / reset
- [ ] `~JC` — media sensor calibration
- [ ] `~JD` / `~JE` — enable / disable comm diagnostics
- [ ] `~JF` — set battery condition
- [ ] `~JG` — graphing sensor calibration
- [ ] `^JH` — early warning settings
- [ ] `~JI` — start ZBI
- [ ] `^JJ` — set auxiliary port
- [ ] `~JL` — set label length
- [ ] `^JM` — set dots per millimeter
- [ ] `~JN` / `~JO` — head test fatal / non-fatal
- [ ] `~JP` — pause and cancel format
- [ ] `~JQ` — terminate ZBI
- [ ] `~JR` — power on reset
- [ ] `~JS` — change backfeed sequence
- [ ] `^JT` — head test interval
- [ ] `^JU` — configuration update
- [ ] `^JW` — set ribbon tension
- [ ] `~JX` — cancel partial format
- [ ] `^JZ` — reprint after error
- [ ] `~RO` — reset advanced counter
- [ ] `^SC` — set serial comm
- [ ] `^SE` / `~SE` — encoding table
- [ ] `^SI` — set sensor intensity
- [ ] `^SL` — set mode & language
- [ ] `^SP` — start ZBI program
- [ ] `^SQ` — halt ZBI execution
- [ ] `^SR` — set printhead resistance
- [ ] `^SS` — set media sensors
- [ ] `^SX` — set ZebraNet alert
- [ ] `^SZ` — set ZPL mode
- [ ] `~TA` — tear-off adjust
- [ ] `^TO` — transfer object
- [ ] `~WC` — print configuration label
- [ ] `^WD` — print directory label
- [ ] `~WQ` — write query
- [ ] `^WT` — write tag (RFID)
- [ ] `^XB` — suppress backfeed
- [ ] `^XS` — set dynamic media calibration
- [ ] `^ZZ` — printer sleep

### Configuration & persistence

- [ ] `^CC` / `~CC` — change caret
- [ ] `^CD` / `~CD` — change delimiter
- [ ] `^CT` / `~CT` — change tilde
- [ ] `^CM` — change memory letter assignment
- [ ] `^KD` — date & time format
- [ ] `^KL` — define language
- [ ] `^KN` — printer name
- [ ] `^KP` — set password
- [ ] `^KV` — firmware version
- [ ] `~KB` — kill battery

### Host communication

- [ ] `~HB` — battery status
- [ ] `~HD` — head diagnostic
- [ ] `^HF` — host format
- [ ] `^HG` — host graphic
- [ ] `^HH` — configuration label return
- [ ] `~HI` — host identification
- [ ] `~HM` — host RAM status
- [ ] `~HQ` — host query
- [ ] `~HS` — host status return
- [ ] `^HT` — host linked fonts list
- [ ] `~HU` — ZebraNet alert config
- [ ] `^HV` — host verification
- [ ] `^HW` — host directory
- [ ] `^HY` — upload graphics
- [ ] `^HZ` — display description info

### RFID

- [ ] `^RF` — read / write RFID
- [ ] `^RI` — get tag ID
- [ ] `^RM` — enable motion
- [ ] `^RN` — detect multiple tags
- [ ] `^RQ` — quick write
- [ ] `^RR` — read timeout
- [ ] `^RS` — RFID setup
- [ ] `^RT` — read tag
- [ ] `^RU` — read UHF
- [ ] `^RV` — report encoding result
- [ ] `^RW` — set read & write power
- [ ] `^RZ` — set tag password
- [ ] `^HL` — RFID data log

### Network

- [ ] `^NB` — search network printer
- [ ] `^NC` / `~NC` — primary network device
- [ ] `^NI` — network ID
- [ ] `^NN` — set SNMP
- [ ] `^NP` — primary / backup device
- [ ] `~NR` — set all network printers transparent
- [ ] `~NT` — set SMTP
- [ ] `^NW` — web auth timeout
