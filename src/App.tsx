import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import HennaStudio from './pages/HennaStudio';
import ColoringPage from './pages/ColoringPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ColoringPage />} />
        <Route path="/color" element={<ColorRedirect />} />
        <Route path="/henna" element={<HennaStudio />} />
      </Routes>
    </BrowserRouter>
  );
}

/** Redirect old /color?room=XXX links to /?room=XXX */
function ColorRedirect() {
  const params = new URLSearchParams(window.location.search);
  const search = params.toString();
  return <Navigate to={`/${search ? `?${search}` : ''}`} replace />;
}
