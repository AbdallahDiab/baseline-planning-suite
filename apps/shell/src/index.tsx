import { createRoot } from 'react-dom/client';
import { ShellApp } from './ShellApp';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Missing root element');
}

createRoot(rootElement).render(<ShellApp />);
