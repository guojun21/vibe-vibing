import React from 'react'
import { createRoot } from 'react-dom/client'
import DevLogApp from './components/devlog-markdown-viewer'
import './styles/devlog-styles.css'

const container = document.getElementById('root')
if (!container) throw new Error('Root element not found')

createRoot(container).render(
  <React.StrictMode>
    <DevLogApp />
  </React.StrictMode>
)
