import readline from 'readline';
import { loadAccounts, DcAccount } from './accountLoader';
import { ClientQuest } from './client';
import { Constants } from './constants';
import { analyzeQuestRewards, sortQuestsByOrbs } from './rewardHelper';
import {
	colors as c,
	renderBanner,
	renderTable,
	renderLiveDashboard,
	DashboardAccountState,
} from './ui';
import type { Quest } from './quest';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const validateToken = async (
	token: string,
): Promise<{ valid: boolean; user?: any; error?: string }> => {
	try {
		const res = await fetch('https://discord.com/api/v10/users/@me', {
			headers: {
				Authorization: token,
				'User-Agent': Constants.USER_AGENT,
				'accept-language': 'en-US',
				origin: 'https://discord.com',
				referer: 'https://discord.com/channels/@me',
			},
		});
		if (res.status === 200) {
			const user = (await res.json()) as any;
			return { valid: true, user };
		}
		return { valid: false, error: `HTTP ${res.status} Unauthorized` };
	} catch (err: any) {
		return { valid: false, error: err.message };
	}
};

const waitForUserExit = () => {
	return new Promise<void>((resolve) => {
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
		});
		console.log(`\n${c.bold}${c.white}✨ All tasks finished. Press ${c.cyan}[ENTER]${c.white} to close this window...${c.reset}`);
		rl.question('', () => {
			rl.close();
			resolve();
		});
	});
};

const main = async () => {
	renderBanner();

	// 1. Scan tokens
	const accounts = loadAccounts();
	if (accounts.length === 0) {
		console.log(`${c.neonRed}⚠️  No accounts found!${c.reset}`);
		console.log(`Please paste your Discord token(s) into ${c.cyan}tokens.txt${c.reset} (one per line) and run again.\n`);
		await waitForUserExit();
		process.exit(1);
	}

	console.log(`${c.bold}${c.white}🔍 Step 1: Scanning & Validating Tokens (${accounts.length} found)...${c.reset}\n`);

	const validatedAccounts: {
		account: DcAccount;
		user: any;
	}[] = [];

	const validationRows: string[][] = [];

	for (let i = 0; i < accounts.length; i++) {
		const acc = accounts[i];
		const result = await validateToken(acc.token);
		const indexStr = `${i + 1}`;

		if (result.valid && result.user) {
			const displayName = result.user.global_name
				? `${result.user.global_name} (@${result.user.username})`
				: `@${result.user.username}`;
			validatedAccounts.push({ account: acc, user: result.user });
			validationRows.push([
				indexStr,
				acc.name,
				`${displayName} ${c.dim}(${result.user.id})${c.reset}`,
				`${c.neonGreen}🟢 VALID${c.reset}`,
			]);
		} else {
			validationRows.push([
				indexStr,
				acc.name,
				`${c.gray}Unknown${c.reset}`,
				`${c.neonRed}❌ ${result.error || 'INVALID'}${c.reset}`,
			]);
		}
	}

	renderTable(['#', 'Account', 'Discord User Profile', 'Status'], validationRows);

	if (validatedAccounts.length === 0) {
		console.log(`\n${c.neonRed}❌ None of the provided tokens are valid. Please check tokens.txt and try again.${c.reset}\n`);
		await waitForUserExit();
		process.exit(1);
	}

	console.log(`\n${c.bold}${c.white}🔍 Step 2: Scanning Quests & Inspecting Reward Pools...${c.reset}\n`);

	// Setup clients and retrieve quests for all validated accounts
	interface AccountSession {
		account: DcAccount;
		user: any;
		client: ClientQuest;
		quests: Quest[];
		totalOrbs: number;
		totalItems: number;
		totalDecos: number;
	}

	const sessions: AccountSession[] = [];
	const rewardOverviewRows: string[][] = [];

	let grandTotalOrbs = 0;
	let grandTotalItems = 0;
	let grandTotalDecos = 0;

	for (const item of validatedAccounts) {
		const client = new ClientQuest(item.account.token, item.account.id);
		let validQuests: Quest[] = [];

		try {
			await client.fetchQuests();
			validQuests = client.questManager?.filterQuestsValid() || [];
		} catch (err: any) {
			console.log(`${c.neonRed}⚠️  Failed to fetch quests for ${item.account.name}: ${err.message}${c.reset}`);
		}

		// Sort quests so higher orbs come first (Orb Sniping)
		validQuests = sortQuestsByOrbs(validQuests);

		let accOrbs = 0;
		let accItems = 0;
		let accDecos = 0;

		for (const q of validQuests) {
			const analysis = analyzeQuestRewards(q);
			accOrbs += analysis.totalOrbs;
			accItems += analysis.gameItems.length;
			accDecos += analysis.decorations.length;
		}

		grandTotalOrbs += accOrbs;
		grandTotalItems += accItems;
		grandTotalDecos += accDecos;

		sessions.push({
			account: item.account,
			user: item.user,
			client,
			quests: validQuests,
			totalOrbs: accOrbs,
			totalItems: accItems,
			totalDecos: accDecos,
		});

		const username = item.user.username;
		rewardOverviewRows.push([
			`@${username}`,
			`${validQuests.length} Quest(s)`,
			accOrbs > 0 ? `${c.gold}🔮 ${accOrbs} Orbs${c.reset}` : `${c.gray}0 Orbs${c.reset}`,
			accItems > 0 ? `${c.cyan}🎮 ${accItems} Item(s)${c.reset}` : `${c.gray}0 Items${c.reset}`,
			accDecos > 0 ? `${c.pink}✨ ${accDecos} Deco(s)${c.reset}` : `${c.gray}0 Decos${c.reset}`,
		]);
	}

	rewardOverviewRows.push([
		`${c.bold}${c.white}TOTAL POOL${c.reset}`,
		`${c.bold}${sessions.reduce((a, s) => a + s.quests.length, 0)} Quests${c.reset}`,
		`${c.bold}${c.gold}🔮 ${grandTotalOrbs} Orbs${c.reset}`,
		`${c.bold}${c.cyan}🎮 ${grandTotalItems} Items${c.reset}`,
		`${c.bold}${c.pink}✨ ${grandTotalDecos} Decos${c.reset}`,
	]);

	renderTable(
		['Account', 'Eligible Quests', 'Total Orbs Pool', 'Game Items', 'Avatar Decos'],
		rewardOverviewRows,
	);

	console.log(`\n${c.bold}${c.neonGreen}🎯 Orb Sniping Activated:${c.reset} Quests sorted with highest orb count at the front of the queue.`);
	console.log(`${c.bold}${c.cyan}⚡ Parallel Execution:${c.reset} All accounts will run their 15-minute quests simultaneously.\n`);

	await sleep(2500);

	// 3. Live Dashboard State Setup
	const dashboardStates: DashboardAccountState[] = sessions.map((s) => ({
		name: s.account.name,
		username: `@${s.user.username}`,
		status: s.quests.length > 0 ? 'farming' : 'completed',
		progressPct: 0,
		secondsDone: 0,
		secondsNeeded: 0,
		elapsedSeconds: 0,
		orbsEarned: 0,
		itemsEarned: [],
		decosEarned: [],
		questsCompleted: 0,
		totalQuests: s.quests.length,
	}));

	// Ticker for live dashboard rendering
	let isRunning = true;
	const dashboardInterval = setInterval(() => {
		if (isRunning) {
			renderLiveDashboard(dashboardStates);
		}
	}, 1000);

	// 4. Parallel Account Execution
	const runSession = async (session: AccountSession, state: DashboardAccountState) => {
		if (session.quests.length === 0) {
			state.status = 'completed';
			return;
		}

		state.status = 'farming';

		for (const quest of session.quests) {
			const analysis = analyzeQuestRewards(quest);
			const taskConfig = quest.config?.task_config ?? quest.config?.task_config_v2;
			const taskName = taskConfig?.tasks
				? Object.keys(taskConfig.tasks)[0] || 'DESKTOP'
				: 'DESKTOP';

			state.currentQuestName = quest.config?.messages?.quest_name || 'Discord Quest';
			state.currentQuestReward = analysis.summary;
			state.currentQuestTaskType = taskName;
			state.progressPct = 0;
			state.secondsDone = 0;
			state.secondsNeeded = 900;
			state.elapsedSeconds = 0;

			const questStartTime = Date.now();

			// Timer to track elapsed seconds for this account
			const timerId = setInterval(() => {
				state.elapsedSeconds = Math.floor((Date.now() - questStartTime) / 1000);
			}, 1000);

			try {
				const success = await session.client.questManager!.doingQuest(
					quest,
					(pct, currentSec, targetSec) => {
						state.progressPct = pct;
						state.secondsDone = currentSec;
						state.secondsNeeded = targetSec;
					},
				);

				clearInterval(timerId);

				if (success) {
					// Claim reward
					try {
						await session.client.rest.post(`/quests/${quest.id}/claim`, { body: {} });
					} catch (claimErr: any) {
						// Claim error (already claimed or rate limit)
					}

					state.questsCompleted++;
					state.orbsEarned += analysis.totalOrbs;
					state.itemsEarned.push(...analysis.gameItems);
					state.decosEarned.push(...analysis.decorations);
				}
			} catch (err: any) {
				clearInterval(timerId);
				state.errorReason = err.message || 'Quest Error';
			}
		}

		state.status = 'completed';
	};

	// Execute all accounts in parallel!
	await Promise.all(
		sessions.map((session, idx) => runSession(session, dashboardStates[idx])),
	);

	isRunning = false;
	clearInterval(dashboardInterval);

	// Final render of the dashboard
	renderLiveDashboard(dashboardStates);

	// 5. Final Celebratory Summary
	const totalEarnedOrbs = dashboardStates.reduce((a, s) => a + s.orbsEarned, 0);
	const totalEarnedItems = dashboardStates.reduce((a, s) => a + s.itemsEarned.length, 0);
	const totalEarnedDecos = dashboardStates.reduce((a, s) => a + s.decosEarned.length, 0);
	const totalQuestsFinished = dashboardStates.reduce((a, s) => a + s.questsCompleted, 0);

	console.log(`
${c.neonGreen}╭──────────────────────────────────────────────────────────────────────────╮
│  ${c.bold}${c.white}🎉 ALL QUESTS PROCESSED SUCCESSFULLY!${c.reset}${c.neonGreen}                                  │
╰──────────────────────────────────────────────────────────────────────────╯${c.reset}
`);

	const summaryRows: string[][] = dashboardStates.map((s) => [
		s.username,
		`${s.questsCompleted}/${s.totalQuests} Quests`,
		`${c.gold}🔮 ${s.orbsEarned} Orbs${c.reset}`,
		`${c.cyan}🎮 ${s.itemsEarned.length} Item(s)${c.reset}`,
		`${c.pink}✨ ${s.decosEarned.length} Deco(s)${c.reset}`,
		`${c.neonGreen}✅ FINISHED${c.reset}`,
	]);

	summaryRows.push([
		`${c.bold}${c.white}GRAND TOTAL${c.reset}`,
		`${c.bold}${totalQuestsFinished} Completed${c.reset}`,
		`${c.bold}${c.gold}🔮 ${totalEarnedOrbs} Orbs${c.reset}`,
		`${c.bold}${c.cyan}🎮 ${totalEarnedItems} Items${c.reset}`,
		`${c.bold}${c.pink}✨ ${totalEarnedDecos} Decos${c.reset}`,
		`${c.bold}${c.neonGreen}🎉 COMPLETE${c.reset}`,
	]);

	renderTable(
		['Account', 'Quests Done', 'Orbs Claimed', 'Game DLCs', 'Collectibles', 'Final Status'],
		summaryRows,
	);

	// 6. Interactive wait so terminal never closes automatically
	await waitForUserExit();
};

main().catch(async (err) => {
	console.error(`\n${c.neonRed}Fatal Error: ${err.message}${c.reset}`);
	await waitForUserExit();
	process.exit(1);
});
