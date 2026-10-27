import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './tr.css';
import CalibrationApp from './App.jsx';

createRoot(document.getElementById('root')).render(<StrictMode><CalibrationApp /></StrictMode>);
