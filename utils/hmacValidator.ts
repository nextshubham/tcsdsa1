
import { createHmac, timingSafeEqual } from 'crypto';

export class HmacValidator {
  public isValidSh1 = (
    signature: string,
    rawBody: Buffer,
    secret: string
  ): boolean => {
    if (
      !signature ||
      !Buffer.isBuffer(rawBody) ||
      !secret
    ) {
      return false;
    }

    try {
      // Generate expected HMAC-SHA256 signature
      const expectedSignature = createHmac('sha256', secret)
        .update(rawBody)
        .digest();

      // Decode incoming Base64 signature
      const receivedSignature = Buffer.from(
        signature,
        'base64'
      );

      // Prevent comparison of different buffer lengths
      if (
        receivedSignature.length !==
        expectedSignature.length
      ) {
        return false;
      }

      // Compare signatures securely
      return timingSafeEqual(
        receivedSignature,
        expectedSignature
      );
    } catch {
      return false;
    }
  };
}
