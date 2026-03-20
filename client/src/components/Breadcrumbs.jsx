import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';

const routeNames = {
  '/dashboard/talent': 'Dashboard',
  '/dashboard/talent/overview': 'Overview',
  '/dashboard/talent/profile': 'Profile',
  '/dashboard/talent/portfolio': 'Portfolio',
  '/dashboard/talent/analytics': 'Analytics',
  '/dashboard/talent/applications': 'Applications',
  '/dashboard/talent/messages': 'Messages',
  '/dashboard/talent/settings': 'Settings',
  '/dashboard/agency': 'Dashboard',
  '/dashboard/agency/overview': 'Overview',
  '/dashboard/agency/applicants': 'Applicants',
  '/dashboard/agency/discover': 'Discover',
  '/dashboard/agency/boards': 'Boards',
  '/dashboard/agency/interviews': 'Interviews',
  '/dashboard/agency/reminders': 'Reminders',
  '/dashboard/agency/analytics': 'Analytics',
  '/dashboard/agency/settings': 'Settings',
  '/onboarding': 'Onboarding',
  '/reveal': 'Profile Reveal',
};

export default function Breadcrumbs() {
  const location = useLocation();
  const pathParts = location.pathname.split('/').filter(Boolean);

  // Don't show breadcrumbs on root paths or casting flow
  if (pathParts.length <= 1 || location.pathname === '/onboarding' || location.pathname === '/reveal') {
    return null;
  }

  const breadcrumbs = [];
  let currentPath = '';

  pathParts.forEach((part, index) => {
    currentPath += '/' + part;
    const label = routeNames[currentPath] || part.charAt(0).toUpperCase() + part.slice(1);

    breadcrumbs.push({
      path: currentPath,
      label,
      isLast: index === pathParts.length - 1
    });
  });

  return (
    <nav aria-label="Breadcrumb" className="mb-6">
      <ol className="flex items-center gap-2 text-sm text-gray-600">
        {/* Home Icon */}
        <li>
          <Link
            to="/"
            className="flex items-center hover:text-gray-900 transition-colors"
            aria-label="Home"
          >
            <Home className="h-4 w-4" />
          </Link>
        </li>

        {breadcrumbs.map((crumb, index) => (
          <li key={crumb.path} className="flex items-center gap-2">
            <ChevronRight className="h-4 w-4 text-gray-400" />
            {crumb.isLast ? (
              <span className="font-medium text-gray-900" aria-current="page">
                {crumb.label}
              </span>
            ) : (
              <Link
                to={crumb.path}
                className="hover:text-gray-900 transition-colors"
              >
                {crumb.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
