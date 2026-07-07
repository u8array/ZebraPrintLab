# ZebraPrintLab web build (self-hosted)

Static single-page app. Serve this folder with any web server; no backend required.

- Serve over **HTTPS or localhost**. The app uses `crypto.randomUUID()`, which browsers only expose in secure contexts; plain `http://` on a LAN host will not work.
- Serve at the **domain root**. Assets use absolute paths (`base: '/'`); for a sub-path deployment, build from source with a matching Vite `base`.
