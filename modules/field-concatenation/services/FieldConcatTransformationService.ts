export class FieldConcatTransformationService {
  private static roundDecimal(value: string, decimals: number): string {
    const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(value.trim());
    if (!match) throw new Error('Dec operation requires a numeric value');
    const [, sign, whole, fraction = ''] = match;
    let digits = `${whole}${fraction.padEnd(decimals, '0').slice(0, decimals)}`;
    if (Number(fraction[decimals] ?? '0') >= 5) {
      const chars = digits.split('');
      let carry = 1;
      for (let i = chars.length - 1; i >= 0 && carry; i -= 1) {
        const next = Number(chars[i]) + carry;
        chars[i] = String(next % 10);
        carry = next === 10 ? 1 : 0;
      }
      digits = `${carry ? '1' : ''}${chars.join('')}`;
    }
    const padded = digits.padStart(decimals + 1, '0');
    const integerPart = decimals ? padded.slice(0, -decimals) : padded;
    const fractionalPart = decimals ? `.${padded.slice(-decimals)}` : '';
    const result = `${integerPart.replace(/^0+(?=\d)/, '')}${fractionalPart}`;
    return sign === '-' && !/^0(?:\.0+)?$/.test(result) ? `-${result}` : result;
  }

  private static extractDatePart(value: string, unit: string): string {
    const iso = /^(\d{4})-(\d{2})-(\d{2})(?:T|\s|$)/.exec(value.trim());
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new Error('Extract operation requires a valid date');
    }
    const year = iso?.[1] ?? String(date.getUTCFullYear());
    const month = iso?.[2] ?? String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = iso?.[3] ?? String(date.getUTCDate()).padStart(2, '0');
    if (unit === 'year') return year;
    if (unit === 'month') return month;
    return `${year}-${month}-${day}`;
  }

  public static apply(value: string, operation: string): string {
    const normalized = operation.trim();
    if (!normalized || /^(none|na)$/i.test(normalized)) return value;
    const trim = /^trim\s*(?:\(\s*(\d+)\s*\)|:\s*(\d+))$/i.exec(normalized);
    if (trim) return value.slice(0, Number(trim[1] ?? trim[2]));

    const decimal = /^(?:dec|decimal)\s*(?:\(\s*(\d+)\s*\)|:\s*(\d+))$/i.exec(
      normalized
    );
    if (decimal) {
      const precision = Number(decimal[1] ?? decimal[2]);
      if (precision > 20) throw new Error('Dec precision must not exceed 20');
      return FieldConcatTransformationService.roundDecimal(value, precision);
    }

    const extract = /^extract\s*(?:\(\s*(year|month|date)\s*\)|(year|month|date))$/i.exec(
      normalized
    );
    if (extract) {
      return FieldConcatTransformationService.extractDatePart(
        value,
        (extract[1] ?? extract[2]).toLowerCase()
      );
    }

    throw new Error(`Unsupported FCU operation: ${operation}`);
  }
}
