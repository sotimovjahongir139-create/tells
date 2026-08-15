import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Layout() {
  const { username, logout } = useAuth();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <NavLink to="/dashboard" className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}>
          Boshqaruv paneli
        </NavLink>
        <NavLink to="/calls" className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}>
          Qo'ng'iroqlar
        </NavLink>
        <NavLink to="/settings" className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}>
          Sozlamalar
        </NavLink>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <div className="topbar-title">AI Sales Call Analyzer</div>
          <div className="topbar-right">
            <span>Asadbek</span>
            <span>{username}</span>
            <button className="logout-btn" onClick={logout}>Chiqish</button>
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
