import React, { useState } from 'react';

export const GARAGE_PLACEHOLDER_SRC = '/snorlaxgarage.png';

/**
 * Keeps the SnorlaxGarage mark visible while a remote image is loading and
 * replaces broken image URLs with the same mark. The image itself still uses
 * the caller's loading mode, so lazy-loaded cards remain lazy-loaded.
 */
export default function UniversalImage({
  src,
  alt = '',
  className = '',
  placeholderSrc = GARAGE_PLACEHOLDER_SRC,
  style,
  onLoad,
  onError,
  loading = 'lazy',
  ...props
}) {
  const normalizedSrc = typeof src === 'string' ? src.trim() : '';
  const [loadedSrc, setLoadedSrc] = useState('');
  const [failedSrc, setFailedSrc] = useState('');

  const hasLoaded = normalizedSrc !== '' && loadedSrc === normalizedSrc;
  const usingPlaceholder = !normalizedSrc || failedSrc === normalizedSrc;
  const displaySrc = usingPlaceholder ? placeholderSrc : normalizedSrc;
  const showPlaceholderBackground = !usingPlaceholder && !hasLoaded;

  return (
    <img
      loading={loading}
      {...props}
      src={displaySrc}
      alt={alt}
      className={className}
      style={{
        ...style,
        ...(showPlaceholderBackground ? {
          backgroundImage: `url("${placeholderSrc}")`,
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          backgroundSize: 'contain'
        } : {})
      }}
      onLoad={(event) => {
        if (normalizedSrc) setLoadedSrc(normalizedSrc);
        onLoad?.(event);
      }}
      onError={(event) => {
        if (!usingPlaceholder) setFailedSrc(normalizedSrc);
        onError?.(event);
      }}
    />
  );
}
