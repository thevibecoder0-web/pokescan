import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

console.log("PokéScan Collector: Initializing Application...");

const rootElement = document.getElementById('root');
if (!rootElement) {
  console.error("Critical Error: Could not find root element to mount the app.");
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);