import React from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import App from './App'
import { register as registerSW } from './sw-register'
import { ErrorBoundary } from './ErrorBoundary'

console.log('Boot: starting Meeting Summarizer')
const root = createRoot(document.getElementById('root')!)
root.render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
)

registerSW()
