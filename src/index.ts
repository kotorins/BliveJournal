import { createVueApp } from './vue';
import App from './MainApp.vue';

const app = createVueApp(App);

app.mount('#app');
