export type SecretIdentityField = 'name' | 'state' | 'house' | 'secretePin' | 'password';

export const SECRET_IDENTITY_VALUES: Record<SecretIdentityField, string> = {
  name: 'jimoh jamihu adekilekun',
  state: 'osun state',
  house: 'dragon house',
  secretePin: '201010',
  password: 'jidejay201010',
};

export function normalizeSecretIdentityValue(value: string | undefined): string {
  return (value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function getSecretIdentityFieldLabel(field: SecretIdentityField): string {
  switch (field) {
    case 'name': return 'name';
    case 'state': return 'state';
    case 'house': return 'house';
    case 'secretePin': return 'secrete pin';
    case 'password': return 'password';
  }
}

export function parseSecretIdentityAnswers(raw: string): Partial<Record<SecretIdentityField, string>> {
  const text = raw ?? '';
  const out: Partial<Record<SecretIdentityField, string>> = {};
  const patterns: Array<[SecretIdentityField, RegExp]> = [
    ['name', /(\bname\b\s*[:=]?\s*)([A-Za-z][A-Za-z\s.]+?)(?=(?:\s+(?:state|house|secrete\s*pin|password)\b)|$)/i],
    ['state', /(\bstate\b\s*[:=]?\s*)([A-Za-z][A-Za-z\s.]+?)(?=(?:\s+(?:house|secrete\s*pin|password)\b)|$)/i],
    ['house', /(\bhouse\b\s*[:=]?\s*)([A-Za-z][A-Za-z\s.]+?)(?=(?:\s+(?:secrete\s*pin|password)\b)|$)/i],
    ['secretePin', /(\bsecrete\s*pin\b\s*[:=]?\s*)([A-Za-z0-9]+?)(?=(?:\s+(?:password)\b)|$)/i],
    ['password', /(\bpassword\b\s*[:=]?\s*)([A-Za-z0-9]+?)(?=$)/i],
  ];

  for (const [field, regex] of patterns) {
    const match = text.match(regex);
    if (match) {
      const value = (match[2] ?? '').trim();
      if (value) out[field] = value;
    }
  }

  const explicitName = text.match(/\bname\b\s*[:=]?\s*([A-Za-z][A-Za-z\s.]+)/i);
  if (explicitName && explicitName[1]) out.name = explicitName[1].trim();
  const explicitState = text.match(/\bstate\b\s*[:=]?\s*([A-Za-z][A-Za-z\s.]+)/i);
  if (explicitState && explicitState[1]) out.state = explicitState[1].trim();
  const explicitHouse = text.match(/\bhouse\b\s*[:=]?\s*([A-Za-z][A-Za-z\s.]+)/i);
  if (explicitHouse && explicitHouse[1]) out.house = explicitHouse[1].trim();
  const explicitPin = text.match(/\bsecrete\s*pin\b\s*[:=]?\s*([A-Za-z0-9]+)/i);
  if (explicitPin && explicitPin[1]) out.secretePin = explicitPin[1].trim();
  const explicitPassword = text.match(/\bpassword\b\s*[:=]?\s*([A-Za-z0-9]+)/i);
  if (explicitPassword && explicitPassword[1]) out.password = explicitPassword[1].trim();

  for (const field of ['name', 'state', 'house', 'secretePin', 'password'] as SecretIdentityField[]) {
    const expected = normalizeSecretIdentityValue(SECRET_IDENTITY_VALUES[field]);
    if (!out[field] && normalizeSecretIdentityValue(text) === expected) {
      out[field] = SECRET_IDENTITY_VALUES[field];
    }
  }

  return out;
}

export function verifySecretIdentity(input: { answers?: Partial<Record<SecretIdentityField, string>>; userMessage?: string }): { ok: boolean; requiredField?: SecretIdentityField; reason?: string } {
  const answers = input.answers ?? parseSecretIdentityAnswers(input.userMessage ?? '');
  const fields: SecretIdentityField[] = ['name', 'state', 'house', 'secretePin', 'password'];

  for (const field of fields) {
    const expected = normalizeSecretIdentityValue(SECRET_IDENTITY_VALUES[field]);
    const provided = normalizeSecretIdentityValue(answers[field]);

    if (!provided) {
      return { ok: false, requiredField: field, reason: `Secret identity required: ${getSecretIdentityFieldLabel(field)}.` };
    }

    if (provided !== expected) {
      return { ok: false, requiredField: field, reason: `Secret identity mismatch for ${getSecretIdentityFieldLabel(field)}.` };
    }
  }

  return { ok: true };
}
