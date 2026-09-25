// Normalizes a typed phone to the E.164-style digits WhatsApp/Meta expect
// ("+5511999998888"). Operators in Brazil usually type only DDD + number,
// so 10–11 digits without a country code get the 55 prefix.
export const normalizePhone = (raw) => {
  let digits = String(raw || '').replace(/\D/g, '');
  if (!String(raw || '').trim().startsWith('+') && (digits.length === 10 || digits.length === 11)) {
    digits = `55${digits}`;
  }
  if (digits.length < 8 || digits.length > 15) return null;
  return `+${digits}`;
};

export default normalizePhone;
