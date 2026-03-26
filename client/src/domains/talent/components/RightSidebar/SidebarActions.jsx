import React from 'react';
import { Link } from 'react-router-dom';
import { Upload, Edit, Eye, Download } from 'lucide-react';
import './SidebarWidget.css';

export const SidebarActions = () => {
  return (
    <div className="actions-grid">
      <Link to="/dashboard/talent/media" className="action-btn-sidebar primary">
        <Upload size={16} /> Upload
      </Link>
      <Link to="/dashboard/talent/profile" className="action-btn-sidebar">
        <Edit size={16} /> Edit
      </Link>
      <Link to="/dashboard/talent/media" className="action-btn-sidebar">
        <Eye size={16} /> View
      </Link>
      <Link to="/dashboard/talent/media" className="action-btn-sidebar">
        <Download size={16} /> Comp Card
      </Link>
    </div>
  );
};
