import { createVueApp } from './vue';
import PopupApp from './PopupApp.vue'

const app = createVueApp(PopupApp);
app.mount('#app');
