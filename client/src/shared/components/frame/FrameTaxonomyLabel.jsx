import React from 'react';
import {
  labelForShot,
  labelForImageType,
  labelForStyle,
  labelForSignal,
  labelForExpression,
} from '../../constants/frameTaxonomy';
import { surfacePrefix, signalClass } from './frameSurface';
import './FrameTaxonomy.css';

const RESOLVERS = {
  framing: labelForShot,
  use: labelForImageType,
  register: labelForStyle,
  expression: labelForExpression,
};

/**
 * Single taxonomy dimension as a premium linked chip.
 */
export default function FrameTaxonomyLabel({
  dimension,
  value,
  signalKey = null,
  surface = 'frame',
  className = '',
  as: Component = 'span',
}) {
  const resolve = dimension === 'signal' && signalKey
    ? (val) => labelForSignal(signalKey, val)
    : RESOLVERS[dimension];
  const label = resolve ? resolve(value) : '';
  if (!label) return null;

  const prefix = surfacePrefix(surface);
  const partKey = dimension === 'signal' ? 'signal' : dimension;

  return (
    <Component className={`frame-taxonomy-label ${signalClass(prefix, partKey)} ${className}`.trim()}>
      {label}
    </Component>
  );
}
