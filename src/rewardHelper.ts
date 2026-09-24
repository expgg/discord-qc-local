import type { Quest, QuestReward } from './interface';

export interface RewardAnalysis {
	totalOrbs: number;
	gameItems: string[];
	decorations: string[];
	summary: string;
}

export const analyzeQuestRewards = (quest: Quest): RewardAnalysis => {
	let totalOrbs = 0;
	const gameItems: string[] = [];
	const decorations: string[] = [];

	const rewards: QuestReward[] = quest.config?.rewards_config?.rewards || [];

	for (const r of rewards) {
		// 1. Check orbs
		if (typeof r.orb_quantity === 'number' && r.orb_quantity > 0) {
			totalOrbs += r.orb_quantity;
		} else if (r.messages?.name && /orb/i.test(r.messages.name)) {
			const match = r.messages.name.match(/(\d+)\s*orb/i);
			if (match) {
				totalOrbs += parseInt(match[1], 10);
			} else {
				totalOrbs += 30; // standard default for orb quests
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

	const parts: string[] = [];
	if (totalOrbs > 0) parts.push(`🔮 ${totalOrbs} Orbs`);
	if (decorations.length > 0) parts.push(`✨ ${decorations.join(', ')}`);
	if (gameItems.length > 0) parts.push(`🎮 ${gameItems.join(', ')}`);

	return {
		totalOrbs,
		gameItems,
		decorations,
		summary: parts.join(' | ') || '🎁 In-Game Reward',
	};
};

/**
 * Sorts quests with the highest orb count first (Orb Sniping)
 */
export const sortQuestsByOrbs = (quests: Quest[]): Quest[] => {
	return [...quests].sort((a, b) => {
		const aOrbs = analyzeQuestRewards(a).totalOrbs;
		const bOrbs = analyzeQuestRewards(b).totalOrbs;
		return bOrbs - aOrbs;
	});
};
