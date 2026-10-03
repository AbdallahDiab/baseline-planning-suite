import { createRoot } from 'react-dom/client';
import DeliveryApp from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Missing root element');
}

createRoot(rootElement).render(<DeliveryApp />);
