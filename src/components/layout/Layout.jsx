import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';
import Footer from './Footer';
import './Layout.css';

export default function Layout() {
  return (
    <div className="layout">
      <Navbar />
      <main className="main-content" id="main-content" role="main">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
