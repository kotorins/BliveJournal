import { createI18n } from 'vue-i18n';
import { zhCN } from './locale.zh-CN';

export const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  formatFallbackMessages: true,
  messages: {
    'zh-CN': zhCN,
  },
});
