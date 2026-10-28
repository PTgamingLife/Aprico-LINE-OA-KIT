import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
export default defineConfig({base:'/Aprico-LINE-OA-KIT/',build:{rollupOptions:{input:Object.fromEntries(['index','design','build','trial'].map(n=>[n,fileURLToPath(new URL(`./${n}.html`,import.meta.url))]))}}});
