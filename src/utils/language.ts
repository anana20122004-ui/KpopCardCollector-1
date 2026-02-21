export const translations = {
  en: {
    language_set: "Your language has been set to English!",
    invalid_language: "Invalid language selection.",
    balance: "Your balance is {coins} coins.",
  },
  es: {
    language_set: "¡Tu idioma ha sido configurado a Español!",
    invalid_language: "Selección de idioma no válida.",
    balance: "Tu saldo es de {coins} monedas.",
  }
};

export function getTranslation(lang: string | null | undefined, key: keyof typeof translations.en, vars: Record<string, any> = {}) {
  const language = (lang === 'es' ? 'es' : 'en') as 'en' | 'es';
  let text = translations[language][key] || translations.en[key];
  
  for (const [vKey, vVal] of Object.entries(vars)) {
    text = text.replace(`{${vKey}}`, vVal.toString());
  }
  return text;
}
