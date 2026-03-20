import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useFlash } from '../hooks/useFlash';
import '../styles/dashboard.css';

function Sidebar({ user, profile }) {
  const isPro = profile?.is_pro;

  const getNavLinkClass = ({ isActive }) => 
    `nav-item ${isActive ? 'active' : ''}`;

  return (
    <aside className="dashboard-sidebar">
      <div className="sidebar-header">
        <h1 className="sidebar-brand">Pholio</h1>
      </div>

      <nav className="sidebar-nav">
        <NavLink to="/dashboard/talent" end className={getNavLinkClass}>
          <span>Dashboard</span>
        </NavLink>
        
        <NavLink to="/dashboard/talent/settings" className={getNavLinkClass}>
          <span>Settings</span>
        </NavLink>

        {isPro && (
          <NavLink to="/dashboard/talent/pdf-customizer" className={getNavLinkClass}>
            <span>PDF Customizer</span>
          </NavLink>
        )}
      </nav>

      <div className="sidebar-footer">
        <div className="user-profile-preview">
          <div className="user-avatar">
            {profile?.first_name?.[0] || user?.email?.[0]?.toUpperCase()}
          </div>
          <div className="user-info">
            <p className="user-name">
              {profile?.first_name ? `${profile.first_name} ${profile.last_name}` : 'Talent'}
            </p>
            <p className="user-email">{user?.email}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}

export default function DashboardLayout() {
  const { user, profile, isLoading, error } = useAuth();
  const { message, clearFlash } = useFlash();

  if (isLoading) {
    return <div className="loading-screen">Loading...</div>;
  }

  if (error) {
    return (
      <div className="error-screen" style={{ padding: '2rem', textAlign: 'center', marginTop: '10vh' }}>
        <h2>Connection Error</h2>
        <p style={{ color: 'red', margin: '1rem 0' }}>{error.message || 'Failed to load dashboard data.'}</p>
        <button 
          onClick={() => window.location.reload()} 
          className="btn-primary"
          style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}
        >
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <div className="dashboard-layout">
       <Sidebar user={user} profile={profile} />

       <main className="dashboard-main">
          {message && (
            <div className={`flash-message ${message.type}`}>
               <span>{message.text}</span>
               <button onClick={clearFlash} className="flash-close">&times;</button>
            </div>
          )}
          
          <Outlet />
       </main>
    </div>
  );
}
