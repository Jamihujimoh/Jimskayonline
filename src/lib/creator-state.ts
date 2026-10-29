const CREATOR_VERIFICATION_STORAGE_KEY = 'jimskay.creatorVerified';
export const CREATOR_VERIFICATION_CODE = 'jimskay-2026';

export function isValidCreatorVerificationCode(value: string): boolean {
  return value.trim().toLowerCase() === CREATOR_VERIFICATION_CODE.toLowerCase();
}

export function getStoredCreatorVerification(): boolean {
  if (typeof window === 'undefined') return false;
  const value = window.localStorage.getItem(CREATOR_VERIFICATION_STORAGE_KEY);
  return value === 'true';
}

export function verifyCreatorCode(value: string): boolean {
  return value.trim().toLowerCase() === CREATOR_VERIFICATION_CODE.toLowerCase();
}

export function setStoredCreatorVerification(isVerified: boolean): void {
  if (typeof window === 'undefined') return;
  if (isVerified) {
    window.localStorage.setItem(CREATOR_VERIFICATION_STORAGE_KEY, 'true');
  } else {
    window.localStorage.removeItem(CREATOR_VERIFICATION_STORAGE_KEY);
  }
}

export function getEffectiveCreatorStatus(profile?: { isVerifiedCreator?: boolean; username?: string; status?: string } | null): boolean {
  const verifiedByProfile = !!profile?.isVerifiedCreator;
  const verifiedByStorage = getStoredCreatorVerification();

  return verifiedByProfile || verifiedByStorage;
}
