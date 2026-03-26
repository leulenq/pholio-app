import React from 'react';
import PhotosTab from '../../components/PhotosTab';
import { Section } from '../../components/profile-index';

/**
 * Full-width photos manager when ?tab=photos is active.
 */
export function PhotosSection({ onPhotoUploaded }) {
  return (
    <Section id="photos-tab" title="" description="" showDivider={false}>
      <PhotosTab onPhotoUploaded={onPhotoUploaded} />
    </Section>
  );
}
