
import { createHmac, timingSafeEqual } from 'crypto';

export class HmacValidator {
  private readonly algorithm = 'sha256';

  public isValidSh1(
    signature: string,
    rawBody: Buffer,
    secret: string
  ): boolean {
    if (!signature || !Buffer.isBuffer(rawBody) || !secret) {
      return false;
    }

    try {
      const expectedSignature = createHmac(
        this.algorithm,
        secret
      )
        .update(rawBody)
        .digest();

      const receivedSignature = Buffer.from(
        signature,
        'base64'
      );

      if (
        receivedSignature.length !==
        expectedSignature.length
      ) {
        return false;
      }

      return timingSafeEqual(
        receivedSignature,
        expectedSignature
      );
    } catch {
      return false;
    }
  }
}
