import React, { useEffect, useRef, useState } from 'react';

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
  ...props
}) {
  const normalizedSrc = typeof src === 'string' ? src.trim() : '';
  const [hasLoaded, setHasLoaded] = useState(!normalizedSrc);
  const [hasError, setHasError] = useState(false);
  const sourceRef = useRef(normalizedSrc);

  useEffect(() => {
    sourceRef.current = normalizedSrc;
    setHasLoaded(!normalizedSrc);
    setHasError(false);
  }, [normalizedSrc]);

  const usingPlaceholder = !normalizedSrc || hasError;
  const displaySrc = usingPlaceholder ? placeholderSrc : normalizedSrc;
  const showPlaceholderBackground = !usingPlaceholder && !hasLoaded;

  return (
    <img
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
        if (sourceRef.current === normalizedSrc) setHasLoaded(true);
        onLoad?.(event);
      }}
      onError={(event) => {
        if (!usingPlaceholder && sourceRef.current === normalizedSrc) {
          setHasError(true);
          setHasLoaded(false);
        }
        onError?.(event);
      }}
    />
  );
}
