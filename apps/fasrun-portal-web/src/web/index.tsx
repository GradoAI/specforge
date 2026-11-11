import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

/** Placeholder page; the workbench and console arrive in M3. */
function App() {
  return (
    <main>
      <h1>Fasrun 帆驭</h1>
      <p>门户正在建设中。</p>
    </main>
  );
}

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
