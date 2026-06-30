import React from 'react';
import PholioButton from '../ui/PholioButton';

export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  actionLabel
}) {
  return (
    <div className="text-center py-12">
      {Icon && (
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mb-4">
          <Icon className="w-8 h-8 text-gray-400" />
        </div>
      )}
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      {description && (
        <p className="text-gray-600 mb-6 max-w-md mx-auto">{description}</p>
      )}
      {action && actionLabel && (
        <PholioButton
          variant="primary"
          onClick={action}
        >
          {actionLabel}
        </PholioButton>
      )}
    </div>
  );
}
