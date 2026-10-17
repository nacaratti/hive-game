/** Reads a QR code with the phone camera (mobile app only). Returns null if cancelled. */
export async function scanQr(): Promise<string | null> {
  const { BarcodeScanner, BarcodeFormat } = await import('@capacitor-mlkit/barcode-scanning');
  const { supported } = await BarcodeScanner.isSupported();
  if (!supported) throw new Error('Este aparelho não consegue ler QR codes.');
  // Android uses Google's code scanner, which needs no camera permission but may need a one-time module download.
  if ((await import('@capacitor/core')).Capacitor.getPlatform() === 'android') {
    const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
    if (!available) await BarcodeScanner.installGoogleBarcodeScannerModule();
  }
  try {
    const { barcodes } = await BarcodeScanner.scan({ formats: [BarcodeFormat.QrCode] });
    return barcodes[0]?.rawValue ?? null;
  } catch {
    return null;
  }
}
