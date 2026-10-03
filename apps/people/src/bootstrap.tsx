import { createRoot } from 'react-dom/client';
import PeopleApp from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Missing root element');
}

createRoot(rootElement).render(<PeopleApp />);
