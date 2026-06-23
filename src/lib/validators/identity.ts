// Validadores de identidad fiscal española (UC-502 · AC-06/07).
// NIF (persona física), NIE, CIF (empresa) con dígito de control + IBAN (módulo 97).

const DNI_LETTERS = "TRWAGMYFPDXBNJZSQVHLCKE";
const CIF_CONTROL_LETTERS = "JABCDEFGHI";

function normalize(value: string): string {
  return (value ?? "").toUpperCase().trim().replace(/[\s-]/g, "");
}

/** DNI: 8 dígitos + letra de control. */
export function isValidDni(value: string): boolean {
  const v = normalize(value);
  if (!/^\d{8}[A-Z]$/.test(v)) return false;
  const number = parseInt(v.slice(0, 8), 10);
  return DNI_LETTERS[number % 23] === v[8];
}

/** NIE: [XYZ] + 7 dígitos + letra. X→0, Y→1, Z→2 y luego algoritmo DNI. */
export function isValidNie(value: string): boolean {
  const v = normalize(value);
  if (!/^[XYZ]\d{7}[A-Z]$/.test(v)) return false;
  const prefix = "XYZ".indexOf(v[0]).toString();
  const number = parseInt(prefix + v.slice(1, 8), 10);
  return DNI_LETTERS[number % 23] === v[8];
}

/** CIF: letra inicial + 7 dígitos + control (dígito o letra según tipo). */
export function isValidCif(value: string): boolean {
  const v = normalize(value);
  if (!/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(v)) return false;

  const digits = v.slice(1, 8);
  const control = v[8];
  let sumEven = 0;
  let sumOdd = 0;
  for (let i = 0; i < digits.length; i++) {
    const n = parseInt(digits[i], 10);
    if (i % 2 === 0) {
      // posiciones impares (1ª, 3ª…): se duplican y se suman sus dígitos
      const d = n * 2;
      sumOdd += Math.floor(d / 10) + (d % 10);
    } else {
      sumEven += n;
    }
  }
  const total = sumEven + sumOdd;
  const controlDigit = (10 - (total % 10)) % 10;
  const controlLetter = CIF_CONTROL_LETTERS[controlDigit];

  const firstLetter = v[0];
  // Organizaciones cuyo control es SIEMPRE letra
  if ("PQRSNW".includes(firstLetter)) return control === controlLetter;
  // Organizaciones cuyo control es SIEMPRE dígito
  if ("ABEH".includes(firstLetter)) return control === controlDigit.toString();
  // El resto admite dígito o letra
  return control === controlDigit.toString() || control === controlLetter;
}

/** Valida un identificador fiscal: NIF (DNI), NIE o CIF. */
export function isValidNifCif(value: string): boolean {
  const v = normalize(value);
  if (/^[XYZ]/.test(v)) return isValidNie(v);
  if (/^\d/.test(v)) return isValidDni(v);
  return isValidCif(v);
}

/** IBAN: validación de longitud por país + módulo 97 == 1. */
export function isValidIban(value: string): boolean {
  const v = normalize(value);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(v)) return false;

  // Longitud exacta para España (24). Para otros países se acepta el rango + mod 97.
  if (v.startsWith("ES") && v.length !== 24) return false;

  // Mover los 4 primeros caracteres al final y convertir letras a números (A=10…Z=35)
  const rearranged = v.slice(4) + v.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (c) => (c.charCodeAt(0) - 55).toString());

  // Módulo 97 sobre número grande (por bloques para evitar overflow)
  let remainder = 0;
  for (let i = 0; i < numeric.length; i += 7) {
    remainder = parseInt(remainder.toString() + numeric.slice(i, i + 7), 10) % 97;
  }
  return remainder === 1;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test((value ?? "").trim());
}
