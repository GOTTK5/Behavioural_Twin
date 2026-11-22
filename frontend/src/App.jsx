import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, NavLink } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import DailyLog from './pages/DailyLog';
import Twin from './pages/Twin';
import Insights from './pages/Insights';
import Profile from './pages/Profile';
import Login from './pages/Login';
import { getToken, setToken as saveToken, clearToken } from './services/api';
import './App.css';

const NAV = [
  { to: '/dashboard', icon: '📊', label: 'Dashboard' },
  { to: '/log',       icon: '📝', label: 'Daily Log' },
  { to: '/twin',      icon: '🧠', label: 'Twin' },
  { to: '/insights',  icon: '💡', label: 'Insights' },
  { to: '/profile',   icon: '👤', label: 'Profile' }
];

export default function App() {
  const [token, setToken] = useState(getToken());

  const login = (t) => { saveToken(t); setToken(t); };
  const logout = () => { clearToken(); setToken(null); };

  useEffect(() => {
    const onLogout = () => setToken(null);
    window.addEventListener('twin:logout', onLogout);
    return () => window.removeEventListener('twin:logout', onLogout);
  }, []);

  if (!token) return <Login onLogin={login} />;

  return (
    <BrowserRouter>
      <div className="app">
        <nav className="sidebar">
          <div className="logo">Twin</div>
          {NAV.map(n => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
              <span className="nav-icon">{n.icon}</span> <span className="nav-label">{n.label}</span>
            </NavLink>
          ))}
          <button className="logout-btn" onClick={logout}>Logout</button>
        </nav>
        <main className="content">
          <Routes>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/log"       element={<DailyLog />} />
            <Route path="/twin"      element={<Twin />} />
            <Route path="/insights"  element={<Insights />} />
            <Route path="/profile"   element={<Profile onLogout={logout} />} />
            <Route path="*"          element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
