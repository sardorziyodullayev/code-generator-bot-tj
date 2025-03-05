const uzPhoneNumber = /^99[2|8][0-9]{9}$/;

export const phoneCheck = (phone: string): boolean => uzPhoneNumber.test(phone);
