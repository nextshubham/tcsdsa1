
import { createHmac, timingSafeEqual } from 'crypto';

export class HmacValidator {
  public isValidSh1(
    xSh1Header: string,
    rawRequestBody: Buffer,
    hmacSecretKey: string
  ): boolean {
    if (!xSh1Header || !rawRequestBody || !hmacSecretKey) {
      return false;
    }

    try {
      const calculatedHash = createHmac('sha256', hmacSecretKey)
        .update(rawRequestBody)
        .digest();

      const providedHash = Buffer.from(xSh1Header, 'base64');

      if (
        providedHash.length !== calculatedHash.length ||
        providedHash.toString('base64') !== xSh1Header
      ) {
        return false;
      }

      return timingSafeEqual(calculatedHash, providedHash);
    } catch {
      return false;
    }
  }
}
