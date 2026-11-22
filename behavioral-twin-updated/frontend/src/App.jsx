import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, NavLink } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import DailyLog from './pages/DailyLog';
import Twin from './pages/Twin';
import Insights from './pages/Insights';
import Profile from './pages/Profile';
import Login from './pages/Login';
import './App.css';

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('twin_token'));

  const login = (t) => { localStorage.setItem('twin_token', t); setToken(t); };
  const logout = () => { localStorage.removeItem('twin_token'); setToken(null); };

  if (!token) return <Login onLogin={login} />;

  return (
    <BrowserRouter>
      <div className="app">
        <nav className="sidebar">
          <div className="logo">Twin</div>
          <NavLink to="/dashboard" className={({isActive}) => isActive ? 'nav-item active' : 'nav-item'}>
            <span className="nav-icon">📊</span> Dashboard
          </NavLink>
          <NavLink to="/log" className={({isActive}) => isActive ? 'nav-item active' : 'nav-item'}>
            <span className="nav-icon">📝</span> Daily Log
          </NavLink>
          <NavLink to="/twin" className={({isActive}) => isActive ? 'nav-item active' : 'nav-item'}>
            <span className="nav-icon">🧠</span> Twin
          </NavLink>
          <NavLink to="/insights" className={({isActive}) => isActive ? 'nav-item active' : 'nav-item'}>
            <span className="nav-icon">💡</span> Insights
          </NavLink>
          <NavLink to="/profile" className={({isActive}) => isActive ? 'nav-item active' : 'nav-item'}>
            <span className="nav-icon">👤</span> Profile
          </NavLink>
          <button className="logout-btn" onClick={logout}>Logout</button>
        </nav>
        <main className="content">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/log"       element={<DailyLog />} />
            <Route path="/twin"      element={<Twin />} />
            <Route path="/insights"  element={<Insights />} />
            <Route path="/profile"   element={<Profile onLogout={logout} />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
