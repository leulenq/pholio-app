import React from 'react';
import { Upload, Edit, Eye, Download } from 'lucide-react';
import PholioButton from '../../../../shared/components/ui/PholioButton';
import './SidebarWidget.css';

export const SidebarActions = () => {
  return (
    <div className="actions-grid">
      <PholioButton to="/dashboard/talent/media" variant="primary" className="action-btn-sidebar primary">
        <Upload size={16} /> Upload
      </PholioButton>
      <PholioButton to="/dashboard/talent/profile" variant="secondary" className="action-btn-sidebar">
        <Edit size={16} /> Edit
      </PholioButton>
      <PholioButton to="/dashboard/talent/media" variant="secondary" className="action-btn-sidebar">
        <Eye size={16} /> View
      </PholioButton>
      <PholioButton to="/dashboard/talent/media" variant="secondary" className="action-btn-sidebar">
        <Download size={16} /> Comp Card
      </PholioButton>
    </div>
  );
};
