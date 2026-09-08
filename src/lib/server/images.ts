import sharp from 'sharp';

/** Receipt photos are stored downscaled: legible, a few hundred KB, not 4 MB. */
const MAX_SIDE = 1600;
const JPEG_QUALITY = 80;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export interface StoredImage {
	bytes: Buffer;
	content_type: 'image/jpeg';
	width: number;
	height: number;
}

/**
 * Re-encodes an uploaded image as a JPEG no larger than 1600 px on its
 * longest side, with the phone's EXIF rotation applied so it displays the
 * way it was taken. Throws on anything sharp cannot decode.
 */
export async function normalizeReceiptImage(input: Buffer): Promise<StoredImage> {
	const out = await sharp(input, { failOn: 'error' })
		.rotate()
		.resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
		.jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
		.toBuffer({ resolveWithObject: true });
	return { bytes: out.data, content_type: 'image/jpeg', width: out.info.width, height: out.info.height };
}
