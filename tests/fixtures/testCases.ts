export interface TestCase {
  id: string;
  zpl_input: string;
  expected_bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  image_ref: string;
}

export const testCases: TestCase[] = [
  {
    id: 'barcode_code128_standard',
    zpl_input: '^XA^BY2^FO50,50^BCN,100,Y,N,N^FD123456^FS^XZ',
    expected_bounds: { x: 50, y: 50, width: 200, height: 100 },
    image_ref: 'barcode_code128_standard.png',
  },
  {
    id: 'barcode_code128_small_no_text',
    zpl_input: '^XA^BY1^FO100,100^BCN,50,N,N,N^FDTEST^FS^XZ',
    expected_bounds: { x: 100, y: 100, width: 100, height: 50 },
    image_ref: 'barcode_code128_small_no_text.png',
  },
  {
    id: 'barcode_code128_large_check_digit',
    zpl_input: '^XA^BY3^FO20,20^BCN,150,Y,N,Y^FD98765^FS^XZ',
    expected_bounds: { x: 20, y: 20, width: 300, height: 150 },
    image_ref: 'barcode_code128_large_check_digit.png',
  },
  {
    id: 'barcode_qr_standard',
    zpl_input: '^XA^FO50,50^BQN,2,4^FDQA,Hello World^FS^XZ',
    expected_bounds: { x: 50, y: 50, width: 100, height: 100 },
    image_ref: 'barcode_qr_standard.png',
  },
  {
    id: 'barcode_qr_large_high_ec',
    zpl_input: '^XA^FO150,150^BQN,2,8^FDHA,Zebra Print Lab QR Code Testing^FS^XZ',
    expected_bounds: { x: 150, y: 150, width: 250, height: 250 },
    image_ref: 'barcode_qr_large_high_ec.png',
  },
  {
    id: 'barcode_ean13_standard',
    zpl_input: '^XA^BY2^FO50,50^BEN,100,Y,N^FD123456789012^FS^XZ',
    expected_bounds: { x: 50, y: 50, width: 200, height: 100 },
    image_ref: 'barcode_ean13_standard.png',
  },
  {
    id: 'barcode_datamatrix_standard',
    zpl_input: '^XA^FO50,50^BXN,5,200^FDDataMatrixTest^FS^XZ',
    expected_bounds: { x: 50, y: 50, width: 100, height: 100 },
    image_ref: 'barcode_datamatrix_standard.png',
  },
  {
    id: 'barcode_code39_standard',
    zpl_input: '^XA^BY2^FO50,50^B3N,N,100,Y,N^FDCODE39^FS^XZ',
    expected_bounds: { x: 50, y: 50, width: 200, height: 100 },
    image_ref: 'barcode_code39_standard.png',
  },
  {
    id: 'barcode_pdf417_standard',
    zpl_input: '^XA^BY2^FO50,50^B7N,10,0,0,,,^FDPDF417Test^FS^XZ',
    expected_bounds: { x: 50, y: 50, width: 200, height: 150 },
    image_ref: 'barcode_pdf417_standard.png',
  },
  {
    id: 'barcode_upca_standard',
    zpl_input: '^XA^BY2^FO50,50^BUN,100,Y,N,N^FD01234567890^FS^XZ',
    expected_bounds: { x: 50, y: 50, width: 200, height: 100 },
    image_ref: 'barcode_upca_standard.png',
  },
  {
    id: 'barcode_ean8_standard',
    zpl_input: '^XA^BY2^FO50,50^B8N,100,Y,N^FD1234567^FS^XZ',
    expected_bounds: { x: 50, y: 50, width: 200, height: 100 },
    image_ref: 'barcode_ean8_standard.png',
  },
  {
    id: 'barcode_aztec_standard',
    zpl_input: '^XA^FO50,50^B0N,4,N,N,N,N^FDAztec123^FS^XZ',
    expected_bounds: { x: 50, y: 50, width: 100, height: 100 },
    image_ref: 'barcode_aztec_standard.png',
  },
  {
    id: 'barcode_interleaved2of5_standard',
    zpl_input: '^XA^BY2^FO50,50^B2N,100,Y,N,N^FD12345678^FS^XZ',
    expected_bounds: { x: 50, y: 50, width: 200, height: 100 },
    image_ref: 'barcode_interleaved2of5_standard.png',
  }
];
