import { createApp } from 'vue';
import type { Component } from 'vue';

import { i18n } from './locale/locale';

export const createVueApp = (App: Component) => {
  const app = createApp(App)
  app.use(i18n);
  return app;
};
