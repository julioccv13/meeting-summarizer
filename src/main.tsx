import React from 'react'
import { createRoot } from 'react-dom/client'
import './app/styles.css'
import App from './app/App'
import { register as registerSW } from './sw-register'
import { ErrorBoundary } from './app/ErrorBoundary'

console.log('Boot: starting Meeting Summarizer')
const root = createRoot(document.getElementById('root')!)
root.render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
)

registerSW()
