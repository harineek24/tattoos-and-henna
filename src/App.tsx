import { BrowserRouter, Routes, Route } from 'react-router-dom';
import HennaStudio from './pages/HennaStudio';
import ColoringPage from './pages/ColoringPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HennaStudio />} />
        <Route path="/color" element={<ColoringPage />} />
      </Routes>
    </BrowserRouter>
  );
}
