import React from 'react';
import { toast } from 'sonner';
import { PholioToastCard } from '../components/toast/PholioToaster';

const SINGLE_TOAST_ID = 'pholio-active-toast';
const DEFAULT_TOAST_DURATION = 3000;

function normalizeOptions(options = {}) {
  if (!options || typeof options !== 'object') return {};

  const action = options.action;
  if (typeof action === 'object' && action !== null) {
    return {
      ...options,
      actionLabel: options.actionLabel || action.label,
      onAction: options.onAction || action.onClick,
    };
  }

  return options;
}

function normalizeToastCopy(type, title, options) {
  const rawTitle = typeof title === 'string' ? title.trim() : title;
  const rawDescription = typeof options.description === 'string'
    ? options.description.trim()
    : options.description;

  if (typeof rawTitle !== 'string') {
    return { title: rawTitle, description: rawDescription };
  }

  const lowerTitle = rawTitle.toLowerCase();
  let nextTitle = rawTitle;
  let nextDescription = rawDescription;

  if (type === 'success') {
    if (lowerTitle === 'profile saved successfully') {
      nextTitle = 'Profile saved';
    } else if (lowerTitle === 'media set created') {
      nextTitle = 'Dated set created';
    } else if (lowerTitle === 'current media set updated') {
      nextTitle = 'Current set updated';
    }
  }

  if (type === 'error') {
    if (lowerTitle.startsWith('validation failed')) {
      nextTitle = 'Check a few details';
      nextDescription = nextDescription || 'Review the highlighted fields, then save again.';
    } else if (lowerTitle.includes('subscription required')) {
      nextTitle = 'Upgrade to Studio+ to use this';
      nextDescription = nextDescription || 'This tool is included with Studio+.';
    } else if (lowerTitle === 'update failed') {
      nextTitle = 'We could not save that update';
      nextDescription = nextDescription || 'Try again in a moment.';
    } else if (lowerTitle === 'upload failed') {
      nextTitle = 'Upload did not finish';
      nextDescription = nextDescription || 'Check the file and try again.';
    } else if (lowerTitle.startsWith('failed to save')) {
      nextTitle = 'We could not save your changes';
      nextDescription = nextDescription || 'Try again in a moment.';
    } else if (lowerTitle.startsWith('failed to upload')) {
      nextTitle = 'Upload did not finish';
      nextDescription = nextDescription || 'Check the file and try again.';
    } else if (lowerTitle.startsWith('failed to delete')) {
      nextTitle = 'We could not delete that';
      nextDescription = nextDescription || 'Try again in a moment.';
    } else if (lowerTitle.startsWith('failed to update')) {
      nextTitle = 'We could not update that';
      nextDescription = nextDescription || 'Try again in a moment.';
    } else if (lowerTitle.startsWith('failed to create')) {
      nextTitle = 'We could not create that';
      nextDescription = nextDescription || 'Try again in a moment.';
    } else if (lowerTitle.startsWith('failed to send')) {
      nextTitle = 'We could not send that';
      nextDescription = nextDescription || 'Try again in a moment.';
    } else if (lowerTitle === 'something went wrong') {
      nextTitle = 'Something did not work';
      nextDescription = nextDescription || 'Try again in a moment.';
    }
  }

  return { title: nextTitle, description: nextDescription };
}

function showToast(type, title, options = {}) {
  const normalized = normalizeOptions(options);
  const copy = normalizeToastCopy(type, title, normalized);
  const toastId = SINGLE_TOAST_ID;
  const duration = type === 'loading' ? Infinity : normalized.duration ?? DEFAULT_TOAST_DURATION;

  toast.dismiss();

  return toast.custom(
    (id) => React.createElement(PholioToastCard, {
      id,
      type,
      title: copy.title,
      description: copy.description,
      meta: normalized.meta || normalized.supportingMeta,
      actionLabel: normalized.actionLabel,
      onAction: normalized.onAction,
    }),
    {
      id: toastId,
      duration,
      important: normalized.important,
      unstyled: true,
      className: ['pholio-custom-toast-shell', normalized.className].filter(Boolean).join(' '),
    },
  );
}

function fromFailure(failure, options = {}) {
  if (!failure) {
    return showToast('error', 'Something went wrong', options);
  }

  return showToast('error', failure.toastMessage || failure.title || 'Something went wrong', {
    description: failure.body,
    supportingMeta: failure.supportingMeta,
    ...options,
  });
}

function promise(promiseLike, messages = {}) {
  const id = showToast('loading', messages.loading || 'Working...', {
    description: messages.description,
    meta: messages.meta,
  });

  return Promise.resolve(promiseLike)
    .then((value) => {
      toast.dismiss(id);
      const successMessage = typeof messages.success === 'function'
        ? messages.success(value)
        : messages.success;
      showToast('success', successMessage || 'Complete');
      return value;
    })
    .catch((error) => {
      toast.dismiss(id);
      const errorMessage = typeof messages.error === 'function'
        ? messages.error(error)
        : messages.error;
      showToast('error', errorMessage || error?.message || 'Something went wrong');
      throw error;
    });
}

export const pholioToast = {
  success: (title, options) => showToast('success', title, options),
  error: (title, options) => showToast('error', title, options),
  info: (title, options) => showToast('info', title, options),
  warning: (title, options) => showToast('warning', title, options),
  loading: (title, options) => showToast('loading', title, options),
  promise,
  dismiss: toast.dismiss,
  fromFailure,
};
