import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { talentApi } from '../api/talent';
import ApplicationsList from './ApplicationsList';
import './ApplicationsView.css';

export default function ApplicationsView() {
  const applicationsQuery = useQuery({
    queryKey: ['applications'],
    queryFn: talentApi.getApplications,
    staleTime: 1000 * 60, // 1 minute
    retry: 1,
  });

  const applications = Array.isArray(applicationsQuery.data)
    ? applicationsQuery.data
    : applicationsQuery.data?.data || [];

  if (applicationsQuery.isError) {
    const isProfileMissing = applicationsQuery.error?.status === 404;
    return (
      <div className="applications-view-container">
        <div className="app-view-header">
          <div className="header-content">
            <h1 className="view-title">Applications Management</h1>
            <p className="view-subtitle">Track your submissions and application status</p>
          </div>
        </div>

        <div className="applications-empty-state" role="alert">
          <h3>Couldn&apos;t load applications</h3>
          <p>
            {isProfileMissing
              ? 'Profile not found. Complete your profile setup, then try again.'
              : 'Please check your connection and try again.'}
          </p>
          {isProfileMissing && (
            <Link to="/dashboard/talent/profile" className="withdraw-btn" style={{ textDecoration: 'none' }}>
              Go to Profile
            </Link>
          )}
          <button
            type="button"
            className="withdraw-btn"
            onClick={() => applicationsQuery.refetch()}
            disabled={applicationsQuery.isFetching}
          >
            {applicationsQuery.isFetching ? 'Retrying...' : 'Retry'}
          </button>
        </div>
      </div>
    );
  }

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
        applications={applications}
        isLoading={applicationsQuery.isLoading} 
      />
    </div>
  );
}
