import type { Quest, QuestReward } from './interface';

export interface RewardAnalysis {
	baseOrbs: number;
	totalOrbs: number;
	hasNitroBonus: boolean;
	gameItems: string[];
	decorations: string[];
	summary: string;
}

export const analyzeQuestRewards = (quest: Quest, hasNitro: boolean = false): RewardAnalysis => {
	let baseOrbs = 0;
	const gameItems: string[] = [];
	const decorations: string[] = [];

	const rewards: QuestReward[] = quest.config?.rewards_config?.rewards || [];

	for (const r of rewards) {
		// 1. Check orbs
		if (typeof r.orb_quantity === 'number' && r.orb_quantity > 0) {
			baseOrbs += r.orb_quantity;
		} else if (r.messages?.name && /orb/i.test(r.messages.name)) {
			const match = r.messages.name.match(/(\d+)\s*orb/i);
			if (match) {
				baseOrbs += parseInt(match[1], 10);
			} else {
				baseOrbs += 30; // standard default for orb quests
			}
		} else if (
			r.sku_id ||
			(r.messages?.name && /decoration|avatar|effect|nitro|badge/i.test(r.messages.name))
		) {
			decorations.push(r.messages?.name || 'Avatar Decoration');
		} else if (r.messages?.name) {
			gameItems.push(r.messages.name);
		} else {
			gameItems.push('In-Game Reward');
		}
	}

	// Discord Nitro gives an automatic +20% bonus on Quest Orbs (e.g. 700 -> 840)
	const totalOrbs = hasNitro && baseOrbs > 0 ? Math.round(baseOrbs * 1.2) : baseOrbs;

	const parts: string[] = [];
	if (totalOrbs > 0) {
		parts.push(hasNitro ? `🔮 ${totalOrbs} Orbs (+20% Nitro)` : `🔮 ${totalOrbs} Orbs`);
	}
	if (decorations.length > 0) parts.push(`✨ ${decorations.join(', ')}`);
	if (gameItems.length > 0) parts.push(`🎮 ${gameItems.join(', ')}`);

	return {
		baseOrbs,
		totalOrbs,
		hasNitroBonus: hasNitro && baseOrbs > 0,
		gameItems,
		decorations,
		summary: parts.join(' | ') || '🎁 In-Game Reward',
	};
};

/**
 * Sorts quests with the highest orb count first (Orb Sniping)
 */
export const sortQuestsByOrbs = (quests: Quest[], hasNitro: boolean = false): Quest[] => {
	return [...quests].sort((a, b) => {
		const aOrbs = analyzeQuestRewards(a, hasNitro).totalOrbs;
		const bOrbs = analyzeQuestRewards(b, hasNitro).totalOrbs;
		return bOrbs - aOrbs;
	});
};
