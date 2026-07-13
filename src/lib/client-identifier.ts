export const CLIENT_IDENTIFIER_MIN_LENGTH = 3;
export const CLIENT_IDENTIFIER_MAX_LENGTH = 64;

export const CLIENT_IDENTIFIER_ALLOWED_PATTERN =
  /^[A-Za-z0-9._@-]+$/;

export const CLIENT_IDENTIFIER_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9._@-]{1,62}[A-Za-z0-9]$/;

export type ClientIdentifierRule = {
  key: string;
  label: string;
  passed: boolean;
};

export function sanitizeClientIdentifier(
  rawValue: string,
) {
  return rawValue
    .replace(/[^A-Za-z0-9._@-]/g, '')
    .slice(0, CLIENT_IDENTIFIER_MAX_LENGTH);
}

export function getClientIdentifierRules(
  rawValue: string,
): ClientIdentifierRule[] {
  const value = rawValue.trim();

  const atCount =
    (value.match(/@/g) || []).length;

  return [
    {
      key: 'length',
      label: 'بین ۳ تا ۶۴ کاراکتر',
      passed:
        value.length >= CLIENT_IDENTIFIER_MIN_LENGTH &&
        value.length <= CLIENT_IDENTIFIER_MAX_LENGTH,
    },
    {
      key: 'allowed-characters',
      label: 'فقط حروف انگلیسی، عدد و علامت‌های . @ - _',
      passed:
        value.length > 0 &&
        CLIENT_IDENTIFIER_ALLOWED_PATTERN.test(value),
    },
    {
      key: 'start-and-end',
      label: 'شروع و پایان با حرف انگلیسی یا عدد',
      passed:
        value.length >= CLIENT_IDENTIFIER_MIN_LENGTH &&
        /^[A-Za-z0-9].*[A-Za-z0-9]$/.test(value),
    },
    {
      key: 'at-sign',
      label: 'حداکثر یک علامت @',
      passed:
        value.length > 0 &&
        atCount <= 1,
    },
  ];
}

export function isValidClientIdentifier(
  rawValue: string,
) {
  const value = rawValue.trim();

  const atCount =
    (value.match(/@/g) || []).length;

  return (
    CLIENT_IDENTIFIER_PATTERN.test(value) &&
    atCount <= 1
  );
}
