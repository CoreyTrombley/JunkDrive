export type MoreSubId = 'wormhole' | 'rewards' | 'stats' | 'codex' | 'options' | 'save';
export type MapSubId = 'contracts' | 'signals';

export type SubScreen = { tab: 'more'; id: MoreSubId } | { tab: 'map'; id: MapSubId };
