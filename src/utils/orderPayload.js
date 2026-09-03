// Order documents must stay below Firestore's 1 MiB document limit. Product
// galleries belong to the kit record, so order snapshots keep only a compact
// image reference and never duplicate gallery/base64 data.
export const isEmbeddedImage = (value) => (
  typeof value === 'string' && /^data:image\//i.test(value)
);

export const compactImageReference = (value) => {
  if (!value) return null;
  if (typeof value === 'string') return isEmbeddedImage(value) ? null : value;
  if (typeof value === 'object') {
    if (typeof value.id === 'string' && value.id) return value.id;
    if (typeof value.url === 'string' && value.url) return compactImageReference(value.url);
  }
  return null;
};

// Kits keep the selected grid image in `image` as either a URL or an image ID.
// Resolve that one image without ever copying the kit's gallery into an order.
export const resolveGridImage = (kit = {}, fallback = '') => {
  const images = Array.isArray(kit.images) ? kit.images : [];
  const imageReference = kit.image;
  const selectedImage = images.find((image) => image?.id === imageReference && image?.isGridImage)
    || images.find((image) => image?.isGridImage)
    || images.find((image) => image?.id === imageReference);
  const candidate = selectedImage?.url || imageReference || fallback;

  if (typeof candidate === 'string') return candidate;
  return candidate?.url || '';
};

const compactNestedImageFields = (value) => {
  if (Array.isArray(value)) {
    return value.map((entry) => compactNestedImageFields(entry));
  }

  if (!value || typeof value !== 'object' || value instanceof Date) return value;

  return Object.entries(value).reduce((result, [key, entry]) => {
    // Gallery arrays are redundant in an order. The order detail resolves
    // them from the current kit using the stored image ID.
    if (key.toLowerCase() === 'images') return result;
    if (key.toLowerCase() === 'image' || /thumbnail|preview/i.test(key)) {
      const compact = compactImageReference(entry);
      if (compact) result[key] = compact;
      return result;
    }
    result[key] = compactNestedImageFields(entry);
    return result;
  }, {});
};

export const compactOrderProjectData = (projectData) => (
  projectData && typeof projectData === 'object'
    ? compactNestedImageFields(projectData)
    : projectData || null
);

export const compactOrderItem = (item = {}) => {
  const { images: _images, ...rest } = item;
  const image = isEmbeddedImage(item.image)
    ? item.image
    : compactImageReference(item.image);
  const compact = {
    ...rest,
    // `image` is now the one compacted grid image attached to this order
    // item. Preserve it even when it is a compressed data URL; galleries are
    // still removed above.
    image: image || null
  };

  if (item.projectData) {
    compact.projectData = compactOrderProjectData(item.projectData);

    // projectData already carries production jobs for current projects. Do
    // not write the same potentially large array a second time at item level.
    const hasJobsInProjectData = Array.isArray(item.projectData.productionJobs)
      || item.projectData.projectDetails?.some((detail) => Array.isArray(detail?.productionJobs));
    if (hasJobsInProjectData) delete compact.productionJobs;
  }

  return compact;
};

export const compactOrderPayload = (order = {}) => ({
  ...order,
  ...(Array.isArray(order.items)
    ? { items: order.items.map(compactOrderItem) }
    : {})
});

export const getPayloadByteSize = (value) => {
  const serialized = JSON.stringify(value);
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(serialized).length;
  return serialized.length;
};
