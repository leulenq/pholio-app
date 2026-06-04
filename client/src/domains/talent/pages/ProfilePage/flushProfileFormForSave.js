import { normalizePhoneInput } from '../../../../shared/lib/phone-format';
import { normalizeProfileSocialFields } from '../../../../shared/lib/normalize-social-field';

/**
 * Flush pending blur commits and apply pre-submit normalization so a single
 * Save click works even when a field still has focus.
 * @returns {{ normalized: boolean, pendingCommit: boolean }}
 */
export async function flushProfileFormForSave(setValue, getValues) {
  const form = document.getElementById('profile-form');
  const active = document.activeElement;

  let pendingCommit = false;

  if (form && active instanceof HTMLElement && form.contains(active)) {
    pendingCommit =
      active instanceof HTMLInputElement &&
      active.classList.contains('pholio-premium-tag-input') &&
      active.value.trim() !== '';
    active.blur();
  }

  await new Promise((resolve) => {
    requestAnimationFrame(() => {
      setTimeout(resolve, 0);
    });
  });

  let normalized = false;
  const values = getValues();

  const phone = normalizePhoneInput(values.emergency_contact_phone);
  const normalizedPhone = phone === '' ? null : phone;
  if (normalizedPhone !== values.emergency_contact_phone) {
    setValue('emergency_contact_phone', normalizedPhone, {
      shouldDirty: true,
      shouldValidate: true,
    });
    normalized = true;
  }

  if (normalizeProfileSocialFields(getValues(), setValue)) {
    normalized = true;
  }

  if (normalized) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return { normalized, pendingCommit };
}
