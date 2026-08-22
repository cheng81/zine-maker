import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
// vue-konva does not ship types; declare module in local d.ts if needed
import VueKonva from 'vue-konva'
import './style.css'

// Import page components
import ZineMaker from './pages/ZineMaker.vue'
import MarkdownEditor from './pages/MarkdownEditor.vue'
import { useFontStore } from './stores/fontStore'

const routes = [
  { path: '/', component: ZineMaker },
  { path: '/markdown', component: MarkdownEditor }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(VueKonva)
app.use(router)

async function bootstrap() {
  try {
    await useFontStore(pinia).initialize()
  } catch (error) {
    console.error('Failed to initialize custom fonts:', error)
  }
  app.mount('#app')
}

void bootstrap()
