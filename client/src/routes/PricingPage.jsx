import React from 'react';
import { Check, Sparkles, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function PricingPage() {
  const plans = [
    {
      name: 'Free',
      price: '$0',
      period: 'forever',
      description: 'Perfect for getting started',
      features: [
        'Professional portfolio page',
        'Basic comp card download',
        'Up to 10 portfolio images',
        '7-day analytics',
        'Profile strength tracker',
        'Agency applications'
      ],
      cta: 'Current Plan',
      current: true
    },
    {
      name: 'Studio+',
      price: '$12',
      period: 'per month',
      description: 'For serious talent',
      features: [
        'Everything in Free',
        'Unlimited portfolio images',
        '90-day analytics & insights',
        'Premium PDF themes',
        'Advanced metrics & cohorts',
        'Priority agency selection',
        'Custom branding',
        'Analytics export (CSV)'
      ],
      cta: 'Upgrade to Studio+',
      highlighted: true
    }
  ];

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #faf9f7 0%, #f5f4f2 100%)',
      padding: '4rem 2rem',
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Back Button */}
        <Link
          to="/dashboard/talent"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            color: '#64748b',
            textDecoration: 'none',
            fontSize: '0.875rem',
            fontWeight: 500,
            marginBottom: '3rem',
            transition: 'color 0.2s'
          }}
          onMouseEnter={(e) => e.target.style.color = '#C9A55A'}
          onMouseLeave={(e) => e.target.style.color = '#64748b'}
        >
          <ArrowLeft size={16} />
          Back to Dashboard
        </Link>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
          <h1 style={{
            fontSize: '3rem',
            fontWeight: 700,
            color: '#0f172a',
            marginBottom: '1rem',
            letterSpacing: '-0.02em'
          }}>
            Choose Your Plan
          </h1>
          <p style={{
            fontSize: '1.125rem',
            color: '#64748b',
            maxWidth: '600px',
            margin: '0 auto'
          }}>
            Elevate your portfolio with Studio+. Cancel anytime.
          </p>
        </div>

        {/* Plans Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '2rem',
          maxWidth: '900px',
          margin: '0 auto'
        }}>
          {plans.map((plan) => (
            <div
              key={plan.name}
              style={{
                background: '#ffffff',
                borderRadius: '16px',
                padding: '2.5rem',
                boxShadow: plan.highlighted
                  ? '0 20px 40px -10px rgba(201, 165, 90, 0.2), 0 0 0 2px #C9A55A'
                  : '0 4px 12px -4px rgba(0, 0, 0, 0.08)',
                position: 'relative',
                transform: plan.highlighted ? 'scale(1.05)' : 'scale(1)',
                transition: 'all 0.3s ease'
              }}
            >
              {plan.highlighted && (
                <div style={{
                  position: 'absolute',
                  top: '-12px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: 'linear-gradient(135deg, #C9A55A 0%, #b08d45 100%)',
                  color: '#ffffff',
                  padding: '0.375rem 1rem',
                  borderRadius: '20px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.375rem',
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase'
                }}>
                  <Sparkles size={12} />
                  Recommended
                </div>
              )}

              <h2 style={{
                fontSize: '1.5rem',
                fontWeight: 700,
                color: '#0f172a',
                marginBottom: '0.5rem'
              }}>
                {plan.name}
              </h2>

              <p style={{
                fontSize: '0.875rem',
                color: '#64748b',
                marginBottom: '1.5rem'
              }}>
                {plan.description}
              </p>

              <div style={{ marginBottom: '2rem' }}>
                <span style={{
                  fontSize: '3rem',
                  fontWeight: 700,
                  color: '#0f172a',
                  letterSpacing: '-0.02em'
                }}>
                  {plan.price}
                </span>
                <span style={{
                  fontSize: '0.875rem',
                  color: '#64748b',
                  marginLeft: '0.5rem'
                }}>
                  {plan.period}
                </span>
              </div>

              <ul style={{
                listStyle: 'none',
                padding: 0,
                margin: '0 0 2rem 0'
              }}>
                {plan.features.map((feature, index) => (
                  <li key={index} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.75rem 0',
                    fontSize: '0.875rem',
                    color: '#0f172a',
                    borderBottom: index < plan.features.length - 1 ? '1px solid #f1f5f9' : 'none'
                  }}>
                    <Check size={16} style={{ color: '#C9A55A', flexShrink: 0 }} />
                    {feature}
                  </li>
                ))}
              </ul>

              <button
                disabled={plan.current}
                style={{
                  width: '100%',
                  padding: '0.875rem 1.5rem',
                  background: plan.highlighted ? '#C9A55A' : (plan.current ? '#f1f5f9' : '#0f172a'),
                  color: plan.highlighted ? '#ffffff' : (plan.current ? '#94a3b8' : '#ffffff'),
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '0.9375rem',
                  fontWeight: 600,
                  cursor: plan.current ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                  opacity: plan.current ? 0.6 : 1
                }}
                onMouseEnter={(e) => {
                  if (!plan.current) {
                    e.target.style.transform = 'translateY(-2px)';
                    e.target.style.boxShadow = '0 8px 16px -4px rgba(0, 0, 0, 0.2)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.target.style.transform = 'translateY(0)';
                  e.target.style.boxShadow = 'none';
                }}
              >
                {plan.cta}
              </button>
            </div>
          ))}
        </div>

        {/* FAQ / Info */}
        <div style={{
          marginTop: '4rem',
          textAlign: 'center',
          padding: '2rem',
          background: '#ffffff',
          borderRadius: '12px',
          maxWidth: '800px',
          margin: '4rem auto 0'
        }}>
          <h3 style={{
            fontSize: '1.25rem',
            fontWeight: 600,
            color: '#0f172a',
            marginBottom: '1rem'
          }}>
            Have questions?
          </h3>
          <p style={{
            fontSize: '0.9375rem',
            color: '#64748b',
            lineHeight: 1.6
          }}>
            Upgrade or downgrade at any time. All plans include our core features to help you showcase your talent professionally. Studio+ unlocks advanced analytics, premium themes, and priority features to accelerate your career.
          </p>
        </div>
      </div>
    </div>
  );
}
