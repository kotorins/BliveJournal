import { createRouter, createWebHashHistory } from 'vue-router'
import RoomsView from '@/views/RoomsView.vue';
import RecordDataView from '@/views/RecordDataView.vue';
import ConfigView from '@/views/ConfigView.vue';

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/rooms',
      name: 'rooms',
      component: RoomsView,
    }, {
      path: '/records',
      name: 'records',
      component: RecordDataView,
    }, {
      path: '/configs',
      name: 'configs',
      component: ConfigView,
    }, {
      path: '/:pathMatch(.*)*',
      redirect: '/rooms',
    },
  ]
});

export default router;
