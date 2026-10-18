import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import CustomerRequest from './CustomerRequest.jsx';
import '../styles.css';
import './readability.css';

const routePath = window.location.pathname.replace(/\/+$/, '') || '/';
const Page = routePath === '/request' ? CustomerRequest : App;

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Page />
  </React.StrictMode>
);