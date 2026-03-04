import { BrowserRouter, Routes, Route } from 'react-router-dom';
import HennaStudio from './pages/HennaStudio';
import ColoringPage from './pages/ColoringPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ColoringPage />} />
        <Route path="/henna" element={<HennaStudio />} />
      </Routes>
    </BrowserRouter>
  );
}
