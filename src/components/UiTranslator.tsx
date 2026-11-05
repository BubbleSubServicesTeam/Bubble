import { useEffect } from 'react';
import { useAppLang } from '../lib/i18n';
import { startUiTranslation } from '../lib/uiTranslator';

export default function UiTranslator() {
  const { lang } = useAppLang();
  useEffect(() => startUiTranslation(lang), [lang]);
  return null;
}
