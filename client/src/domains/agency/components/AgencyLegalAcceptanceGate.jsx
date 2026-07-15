import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  acceptAgencyLegalPolicies,
  getAgencyLegalStatus,
} from '../api/agency';
import './AgencyLegalAcceptanceGate.css';

export default function AgencyLegalAcceptanceGate({ children, statusQuery: providedStatusQuery }) {
  const queryClient = useQueryClient();
  const [acceptanceState, setAcceptanceState] = useState({
    manifestVersion: null,
    values: {},
  });
  const ownedStatusQuery = useQuery({
    queryKey: ['agency', 'legal-status'],
    queryFn: getAgencyLegalStatus,
    retry: false,
    enabled: !providedStatusQuery,
  });
  const statusQuery = providedStatusQuery || ownedStatusQuery;
  const policies = statusQuery.data?.policies || [];
  const manifestVersion = statusQuery.data?.manifestVersion || null;
  const acceptance = acceptanceState.manifestVersion === manifestVersion
    ? acceptanceState.values
    : {};

  const acceptMutation = useMutation({
    mutationFn: acceptAgencyLegalPolicies,
    onSuccess: (data) => {
      queryClient.setQueryData(['agency', 'legal-status'], data);
    },
    onError: (error) => {
      if (error?.status === 409) {
        setAcceptanceState({ manifestVersion: null, values: {} });
        queryClient.invalidateQueries({ queryKey: ['agency', 'legal-status'] });
      }
    },
  });

  const allAccepted = policies.length > 0
    && policies.every(({ key }) => acceptance[key]);

  if (statusQuery.isLoading) {
    return (
      <main className="ag-legal-gate ag-legal-gate--state" aria-busy="true">
        <p>Checking workspace access…</p>
      </main>
    );
  }

  if (statusQuery.isError) {
    return (
      <main className="ag-legal-gate ag-legal-gate--state">
        <h1>Workspace access could not be verified</h1>
        <p>Refresh the policy check before continuing.</p>
        <button type="button" onClick={() => statusQuery.refetch()}>Try again</button>
      </main>
    );
  }

  if (!statusQuery.data?.needsAcceptance) {
    return children;
  }

  const toggle = (key) => {
    setAcceptanceState((current) => {
      const values = current.manifestVersion === manifestVersion
        ? current.values
        : {};
      return {
        manifestVersion,
        values: { ...values, [key]: !values[key] },
      };
    });
  };

  const submitAcceptance = () => {
    acceptMutation.mutate({
      manifestVersion,
      acceptances: policies.map(({ key, version, contentDigest }) => ({
        policyKey: key,
        version,
        contentDigest,
        accepted: acceptance[key] === true,
      })),
    });
  };

  return (
    <main className="ag-legal-gate">
      <section className="ag-legal-sheet" aria-labelledby="agency-legal-title">
        <header className="ag-legal-head">
          <h1 id="agency-legal-title">Confirm your agency workspace responsibilities</h1>
          <p>
            Acceptance is recorded for this individual login. Each teammate must review
            the current policies before accessing talent data.
          </p>
        </header>

        <div className="ag-legal-requirements">
          {policies.map((policy) => (
            <label className="ag-legal-requirement" key={policy.key}>
              <input
                type="checkbox"
                checked={acceptance[policy.key] === true}
                onChange={() => toggle(policy.key)}
              />
              <span>
                <span className="ag-legal-requirement-title">
                  <a href={policy.url} target="_blank" rel="noopener noreferrer">
                    {policy.title}
                  </a>
                  <span className="ag-legal-requirement-version">
                    Version {policy.version}
                  </span>
                </span>
                <span className="ag-legal-requirement-copy">{policy.copy}</span>
              </span>
            </label>
          ))}
        </div>

        {acceptMutation.isError ? (
          <p className="ag-legal-error" role="alert">
            {acceptMutation.error?.message || 'Could not save your acceptance. Try again.'}
          </p>
        ) : null}

        <footer className="ag-legal-actions">
          <p>Questions about agency data handling? Contact privacy@pholio.studio.</p>
          <button
            type="button"
            disabled={!allAccepted || acceptMutation.isPending}
            onClick={submitAcceptance}
          >
            {acceptMutation.isPending ? 'Recording acceptance…' : 'Accept and enter workspace'}
          </button>
        </footer>
      </section>
    </main>
  );
}
