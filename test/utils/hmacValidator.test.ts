import { createHmac } from 'crypto';
import { HmacValidator } from '../../utils/hmacValidator';

describe('HmacValidator', () => {
  const validator = new HmacValidator();
  const secret = 'webhook-test-secret';
  const rawBody = Buffer.from('{"event":"create","project_id":42}', 'utf8');

  const sign = (body: Buffer, key: string): string =>
    createHmac('sha256', key).update(body).digest('base64');

  it('accepts a valid Base64 SHA-256 signature for the exact raw body', () => {
    expect(validator.isValidSh1(sign(rawBody, secret), rawBody, secret)).toBe(true);
  });

  it('rejects a signature generated with a different secret', () => {
    expect(validator.isValidSh1(sign(rawBody, 'another-secret'), rawBody, secret)).toBe(false);
  });

  it('rejects a signature when the raw webhook body was tampered with', () => {
    const changedBody = Buffer.from('{"event":"create","project_id":43}', 'utf8');
    expect(validator.isValidSh1(sign(rawBody, secret), changedBody, secret)).toBe(false);
  });

  it('rejects an empty signature', () => {
    expect(validator.isValidSh1('', rawBody, secret)).toBe(false);
  });

  it('rejects an incorrect-length signature without comparing unequal buffers', () => {
    expect(validator.isValidSh1(Buffer.from('short').toString('base64'), rawBody, secret)).toBe(false);
  });

  it('treats insignificant-looking whitespace in JSON as significant for HMAC', () => {
    const spacedBody = Buffer.from('{ "event":"create","project_id":42}', 'utf8');
    expect(validator.isValidSh1(
      sign(rawBody, secret), spacedBody, secret
    )).toBe(false);
  });
});
