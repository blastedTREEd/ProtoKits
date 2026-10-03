const PRINT_STORY_TERMS = /3d\s*print|printed|printing|project|stl|3mf|filament|printer|commission/i;
const KIT_STORY_TERMS = /kit|gundam|bandai|gunpla|collectible|collection|pre[- ]?order|on[- ]?hand|model\s*kit/i;

export const isCombinedMarket = (market) => market === 'all' || market === 'admin';

export const isStoryForMarket = (story, market) => {
  if (isCombinedMarket(market)) return true;

  const explicitMarket = String(
    story?.market || story?.storyMarket || story?.category || ''
  ).trim().toLowerCase();

  if (explicitMarket === 'all' || explicitMarket === 'admin') return true;
  if (explicitMarket === 'kits' || explicitMarket === 'kit') return market === 'kits';
  if (explicitMarket === 'prints' || explicitMarket === 'print' || explicitMarket === 'projects') {
    return market === 'prints';
  }

  const searchableText = [
    story?.label,
    story?.description,
    story?.destination,
    ...(Array.isArray(story?.items) ? story.items : [story?.items])
  ].filter(Boolean).join(' ');
  const looksLikePrintStory = PRINT_STORY_TERMS.test(searchableText);
  const looksLikeKitStory = KIT_STORY_TERMS.test(searchableText);

  if (market === 'prints') return looksLikePrintStory && !looksLikeKitStory;
  if (market === 'kits') return !looksLikePrintStory || looksLikeKitStory;
  return true;
};
