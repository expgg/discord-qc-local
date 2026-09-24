import { GatewayDispatchEvents } from 'discord-api-types/v10';
import fs from 'fs';
import path from 'path';
import { ClientQuest } from './client';
import { loadAccounts, DcAccount } from './accountLoader';

const sleep = (minMs: number, maxMs: number) => {
	const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
	return new Promise((resolve) => setTimeout(resolve, ms));
};

const emit = (event: string, payload: Record<string, unknown>) => {
	console.log(`QEVENT|${JSON.stringify({ event, ...payload })}`);
};

const lookupAccount = (selector: string): DcAccount | null => {
	const accounts = loadAccounts();
	return (
		accounts.find((x) => x.id === selector) ??
		accounts.find((x) => x.name.toLowerCase() === selector.toLowerCase()) ??
		(accounts[Number(selector) - 1] ?? null)
	);
};

process.on('unhandledRejection', (reason: unknown) => {
	emit('runtime_error', { stage: 'unhandledRejection', message: String(reason) });
});

process.on('uncaughtException', (err: unknown) => {
	emit('runtime_error', { stage: 'uncaughtException', message: String(err) });
});

const selector = process.argv[2];
let account: DcAccount | null = null;
if (!selector) {
	const all = loadAccounts();
	if (all.length === 1) {
		account = all[0];
	} else if (all.length === 0) {
		emit('fatal', { message: 'No tokens found! Add your token to tokens.txt or accounts.json' });
		process.exit(1);
	} else {
		emit('fatal', { message: `Multiple accounts found (${all.length}). Please specify account ID/index (e.g. npx tsx src/bot.ts 1) or use npm run all` });
		process.exit(1);
	}
} else {
	account = lookupAccount(selector);
}

if (!account || !account.token) {
	emit('fatal', { message: `Account not found for selector: ${selector}` });
	process.exit(1);
}

const startBot = async () => {
	emit('session_start', { account_id: account.id, account_name: account.name });

	const loginDelay = Math.floor(Math.random() * 3000) + 1000;
	emit('status', { account_id: account.id, phase: 'login_wait', delay_ms: loginDelay });
	await sleep(loginDelay, loginDelay);

	const client = new ClientQuest(account.token, account.id);

	client.once(GatewayDispatchEvents.Ready, async ({ data }) => {
		emit('status', {
			account_id: account.id,
			phase: 'ready',
			username: data.user.username,
			user_id: data.user.id,
		});

		await sleep(800, 1800);
		await client.fetchQuests();
		const questsValid = client.questManager!.filterQuestsValid();
		emit('queue', { account_id: account.id, count: questsValid.length });

		let autoClaimed = 0;
		let manualRequired = 0;
		let completed = 0;

		for (const quest of questsValid) {
			const questName = quest.config.messages.quest_name;
			emit('quest_start', {
				account_id: account.id,
				quest_id: quest.id,
				quest_name: questName,
			});

			let questSuccess = false;
			try {
				questSuccess = await client.questManager!.doingQuest(quest);
			} catch (err: any) {
				emit('quest_error', {
					account_id: account.id,
					quest_id: quest.id,
					quest_name: questName,
					message: String(err?.message ?? err),
				});
				continue;
			}

			if (!questSuccess) {
				emit('quest_error', {
					account_id: account.id,
					quest_id: quest.id,
					quest_name: questName,
					message: 'Enrollment timed out, blocked, or unsupported task.',
				});
				continue;
			}

			completed += 1;
			emit('quest_done', {
				account_id: account.id,
				quest_id: quest.id,
				quest_name: questName,
			});

			try {
				await client.rest.post(`/quests/${quest.id}/claim`, { body: {} });
				autoClaimed += 1;
				emit('claim_result', {
					account_id: account.id,
					quest_id: quest.id,
					quest_name: questName,
					result: 'auto',
				});
			} catch {
				manualRequired += 1;
				emit('claim_result', {
					account_id: account.id,
					quest_id: quest.id,
					quest_name: questName,
					result: 'manual',
				});
			}
		}

		emit('session_summary', {
			account_id: account.id,
			account_name: account.name,
			total_found: questsValid.length,
			completed,
			auto_claimed: autoClaimed,
			manual_required: manualRequired,
		});

		setTimeout(() => process.exit(0), 500);
	});

	client.on('error', (err: any) => {
		emit('runtime_error', {
			account_id: account.id,
			stage: 'client_error',
			message: String(err?.message ?? err),
		});
	});

	client.connect();
};

startBot().catch((err) => {
	emit('fatal', { account_id: account?.id, message: String(err) });
	process.exit(1);
});