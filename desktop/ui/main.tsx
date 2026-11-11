import React from 'react';
import {createRoot} from 'react-dom/client';
import LabApp from '@/components/lab/app';
import '@/app/globals.css';
import '@/app/workbench.css';
import '@/app/studio.css';
import '@/app/typography.css';

// The local workspace starts with durable data, rather than the in-memory demo.
try {if(!localStorage.getItem('product-lab-mode'))localStorage.setItem('product-lab-mode','real');} catch {}
createRoot(document.getElementById('root')!).render(<LabApp/>);
