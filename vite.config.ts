import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import monacoEditorPlugin from 'vite-plugin-monaco-editor'

export default defineConfig({
  plugins: [
    react(),
    // The plugin uses default exports, so this works even if TS says otherwise
    (monacoEditorPlugin as any).default?.({
      languageWorkers: ['editorWorkerService', 'typescript', 'json']
    }) ?? monacoEditorPlugin({
      languageWorkers: ['editorWorkerService', 'typescript', 'json']
    }),
  ],
  base: './',
})
