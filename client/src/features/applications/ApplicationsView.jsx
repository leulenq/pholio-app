import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { talentApi } from '../../api/talent';
import ApplicationsList from './components/ApplicationsList';
import './ApplicationsView.css';

export default function ApplicationsView() {
  const applicationsQuery = useQuery({
    queryKey: ['applications'],
    queryFn: talentApi.getApplications,
    staleTime: 1000 * 60, // 1 minute
  });

  return (
    <div className="applications-view-container">
      {/* Header */}
      <div className="app-view-header">
        <div className="header-content">
          <h1 className="view-title">Applications Management</h1>
          <p className="view-subtitle">Track your submissions and application status</p>
        </div>
      </div>

      {/* Applications List */}
      <ApplicationsList 
        applications={applicationsQuery.data?.data || []} 
        isLoading={applicationsQuery.isLoading} 
      />
    </div>
  );
}
