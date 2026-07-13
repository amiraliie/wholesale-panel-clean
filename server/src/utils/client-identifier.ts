export const CLIENT_IDENTIFIER_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9._@-]{1,62}[A-Za-z0-9]$/;

export function normalizeClientIdentifier(
  value: unknown,
) {
  return String(value ?? '').trim();
}

export function isValidClientIdentifier(
  value: unknown,
) {
  const identifier =
    normalizeClientIdentifier(value);

  const atCount =
    (identifier.match(/@/g) || []).length;

  return (
    CLIENT_IDENTIFIER_PATTERN.test(identifier) &&
    atCount <= 1
  );
}
