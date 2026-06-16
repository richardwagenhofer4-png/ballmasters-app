export function getAge(dateOfBirthISO: string): number | null {
  if (!dateOfBirthISO) return null;
  const dob = new Date(dateOfBirthISO);
  if (isNaN(dob.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

// Safe default: returns true (treat as under-13) when DOB is unknown.
export function isUnder13(dateOfBirthISO: string | undefined | null): boolean {
  if (!dateOfBirthISO) return true;
  const age = getAge(dateOfBirthISO);
  if (age === null) return true;
  return age < 13;
}
