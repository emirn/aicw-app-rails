import sharp from 'sharp';

export interface WebpOptions {
  quality?: number;  // 1-100, default 80
}

/**
 * Convert PNG buffer to WebP format
 */
export async function convertToWebp(pngBuffer: Buffer, options: WebpOptions = {}): Promise<Buffer> {
  const quality = options.quality ?? 80;
  return sharp(pngBuffer).webp({ quality }).toBuffer();
}

/**
 * Convert base64 PNG to base64 WebP
 */
export async function convertBase64ToWebp(base64Png: string, options: WebpOptions = {}): Promise<string> {
  const pngBuffer = Buffer.from(base64Png, 'base64');
  const webpBuffer = await convertToWebp(pngBuffer, options);
  return webpBuffer.toString('base64');
}
