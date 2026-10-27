
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Validates the X-SH1 signature received from Aprimo PM.
 *
 * @param xSh1Header - HMAC signature received in the X-SH1 header.
 * @param rawRequestBody - Original raw webhook request body.
 * @param hmacSecretKey - Configured Aprimo webhook secret.
 * @returns True if the signature is valid, otherwise false.
 */
export const isValidSh1 = (
  xSh1Header: string | undefined,
  rawRequestBody: Buffer,
  hmacSecretKey: string
): boolean => {
  if (
    !xSh1Header ||
    !Buffer.isBuffer(rawRequestBody) ||
    !hmacSecretKey
  ) {
    return false;
  }

  const calculatedSignature = createHmac(
    'sha256',
    Buffer.from(hmacSecretKey, 'utf8')
  )
    .update(rawRequestBody)
    .digest('base64');

  const receivedBuffer = Buffer.from(xSh1Header, 'utf8');
  const calculatedBuffer = Buffer.from(calculatedSignature, 'utf8');

  if (receivedBuffer.length !== calculatedBuffer.length) {
    return false;
  }

  return timingSafeEqual(receivedBuffer, calculatedBuffer);
};
