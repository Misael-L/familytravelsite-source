import { defineConfig, mergeConfig } from 'vite'
import original from './vite.config.js'
/** Fake backend only. Production never imports this configuration or its recorder. */
export default defineConfig(async env => mergeConfig(typeof original === 'function' ? await original(env) : original, {
  envDir: false,
  define: {
    'import.meta.env.VITE_DATA_PLANE': JSON.stringify('supabase'),
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('http://127.0.0.1:5199'),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('family-frontend-public-fixture'),
    'import.meta.env.VITE_MAPBOX_ACCESS_TOKEN': JSON.stringify(''),
  },
  plugins: [{ name: 'family-fixture-api-recorder', enforce: 'pre', transform(code, id) {
    if (!/\/src\/api\/client\.ts(?:\?|$)/.test(id)) return
    return code + `\napiClient.interceptors.response.use(undefined, (error) => {
      if (Array.isArray(window.__adapterErrors)) window.__adapterErrors.push({url:error.config?.url,status:error.response?.status,code:error.response?.data?.code,message:error.response?.data?.message});
      return Promise.reject(error);
    });\n`
  }}],
  server: {host:'127.0.0.1',port:5791,strictPort:true,proxy:{}},
}))
