export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export interface PasswordRequirements {
  hasMinLength: boolean;
  hasUppercase: boolean;
  hasNumber: boolean;
  hasSpecialCharacter: boolean;
  strength: number;
  strengthLabel: string;
  isValid: boolean;
}

const STRENGTH_LABELS = ["", "Weak", "Fair", "Good", "Strong"];

export function getPasswordRequirements(password: string): PasswordRequirements {
  const hasMinLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSpecialCharacter = /[^A-Za-z0-9]/.test(password);

  const strength = [hasMinLength, hasUppercase, hasSpecialCharacter, hasNumber].filter(Boolean).length;

  return {
    hasMinLength,
    hasUppercase,
    hasNumber,
    hasSpecialCharacter,
    strength,
    strengthLabel: password.length === 0 ? "" : STRENGTH_LABELS[strength],
    isValid: hasMinLength && hasUppercase && hasNumber && hasSpecialCharacter,
  };
}
