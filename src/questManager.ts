import { ClientQuest } from './client';
import type { AllQuestsResponse, QuestTaskConfigType } from './interface';
import { Quest } from './quest';

export class QuestManager implements Iterable<Quest> {
	private readonly quests = new Map<string, Quest>();
	public readonly client: ClientQuest;
	constructor(client: ClientQuest, quests: Quest[] = []) {
		this.client = client;
		quests.forEach((quest) => this.quests.set(quest.id, quest));
	}

	static fromResponse(
		client: ClientQuest,
		response: AllQuestsResponse,
	): QuestManager {
		return new QuestManager(
			client,
			response.quests.map((quest) => Quest.create(quest)),
		);
	}

	[Symbol.iterator](): IterableIterator<Quest> {
		return this.quests.values();
	}

	get size(): number {
		return this.quests.size;
	}

	list(): Quest[] {
		return Array.from(this.quests.values());
	}

	get(id: string): Quest | undefined {
		return this.quests.get(id);
	}

	upsert(quest: Quest): void {
		this.quests.set(quest.id, quest);
	}

	remove(id: string): boolean {
		return this.quests.delete(id);
	}

	clear(): void {
		this.quests.clear();
	}

	getExpired(date: Date = new Date()): Quest[] {
		return this.list().filter((quest) => quest.isExpired(date));
	}

	getCompleted(): Quest[] {
		return this.list().filter((quest) => quest.isCompleted());
	}

	getClaimable(): Quest[] {
		return this.list().filter(
			(quest) => quest.isCompleted() && !quest.hasClaimedRewards(),
		);
	}

	hasQuest(id: string): boolean {
		return this.quests.has(id);
	}

	filterQuestsValid() {
		return this.list().filter(
			(quest) =>
				!quest.isCompleted() &&
				!quest.isExpired(),
		);
	}

	getApplicationData(ids: string[]) {
		const query = new URLSearchParams();
		ids.forEach((id) => query.append('application_ids', id));
		return this.client.rest.get(`/applications/public`, {
			query,
		}) as Promise<
			{
				id: string;
				name: string;
				icon: string;
				description: string;
				executables: {
					os: string;
					name: string;
					is_launcher: boolean;
				}[];
			}[]
		>;
	}

	acceptQuest(questId: string) {
		return this.client.rest
			.post(`/quests/${questId}/enroll`, {
				body: {
					location: 11, // Or whatever mobile spoof ID you injected
					is_targeted: false,
					metadata_raw: null,
				},
			})
			.then((r) => {
				const quest = this.get(questId);
				quest?.updateUserStatus(r as any);
				return quest;
			});
	}

	private async timeout(ms: number) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	private async withTimeout<T>(fn: () => Promise<T>, ms: number, errorMessage: string): Promise<T> {
		let timeoutId: NodeJS.Timeout | null = null;
		const timeoutPromise = new Promise<never>((_, reject) => {
			timeoutId = setTimeout(() => {
				reject(new Error(errorMessage));
			}, ms);
		});
		try {
			return await Promise.race([fn(), timeoutPromise]);
		} finally {
			if (timeoutId) clearTimeout(timeoutId);
		}
	}

	async doingQuest(
		quest: Quest,
		onProgress?: (pct: number, currentSec: number, targetSec: number) => void,
	): Promise<boolean> {
		const questName = quest.config.messages.quest_name;
		
		if (!quest.isEnrolledQuest()) {
			if (!onProgress) console.log(`Enrolling in quest "${questName}"...`);
			try {
				await this.withTimeout(
					() => this.acceptQuest(quest.id),
					15000,
					'Enrollment timed out after 15s'
				);
			} catch (err: any) {
				if (!onProgress) console.log(`⚠️ Skipped ${questName}: ${err?.message ?? err}`);
				return false;
			}
		}
        
		const applicationName = quest.config?.application?.name ?? 'Unknown App';
		// Support both legacy task_config and new task_config_v2 (Discord API v2)
		const taskConfig = quest.config?.task_config ?? quest.config?.task_config_v2;
		
		if (!taskConfig || !taskConfig.tasks) {
			if (!onProgress) console.log(`⚠️ Skipped "${questName}": No task config found.`);
			return false;
		}

		const taskName = [
			'WATCH_VIDEO',
			'PLAY_ON_DESKTOP',
			'STREAM_ON_DESKTOP',
			'PLAY_ACTIVITY',
			'WATCH_VIDEO_ON_MOBILE',
		].find(
			(x) => taskConfig.tasks?.[x as QuestTaskConfigType] != null,
		) as QuestTaskConfigType | undefined;

		if (!taskName || !taskConfig.tasks[taskName]) {
			if (!onProgress) console.log(`⚠️ Skipped "${questName}": No supported task type found.`);
			return false;
		}

		const secondsNeeded = taskConfig.tasks[taskName].target;
		let secondsDone = quest.userStatus?.progress?.[taskName]?.value ?? 0;
		let lastEmittedPct = -1;
		const emitProgress = (pct: number, currentSec: number, targetSec: number) => {
			const boundedPct = Math.min(100, Math.max(0, pct));
			onProgress?.(boundedPct, currentSec, targetSec);
			if (this.client.accountId && (lastEmittedPct === -1 || boundedPct >= 100 || boundedPct - lastEmittedPct >= 20)) {
				lastEmittedPct = boundedPct;
				if (!onProgress) {
					console.log(
						`QEVENT|${JSON.stringify({
							event: 'quest_progress',
							account_id: this.client.accountId,
							quest_id: quest.id,
							quest_name: questName,
							progress: boundedPct,
							seconds_done: currentSec,
							seconds_needed: targetSec,
						})}`,
					);
				}
			}
		};

		if (
			taskName === 'WATCH_VIDEO' ||
			taskName === 'WATCH_VIDEO_ON_MOBILE'
		) {
			const maxFuture = 10,
				speed = 7,
				interval = 1;
			const enrolledAt = new Date(
				quest.userStatus?.enrolled_at as any,
			).getTime();
			let completed = false;
			let fn = async () => {
				while (true) {
					const maxAllowed =
						Math.floor((Date.now() - enrolledAt) / 1000) +
						maxFuture;
					const diff = maxAllowed - secondsDone;
					const timestamp = secondsDone + speed;
					if (diff >= speed) {
						const res = (await this.client.rest.post(
							`/quests/${quest.id}/video-progress`,
							{
								body: {
									timestamp: Math.min(
										secondsNeeded,
										timestamp + Math.random(),
									),
								},
							},
						)) as any;
						completed = res.completed_at != null;
						secondsDone = Math.min(secondsNeeded, timestamp);
						const pct = Math.floor((secondsDone / secondsNeeded) * 100);
						emitProgress(pct, secondsDone, secondsNeeded);
					}

					if (timestamp >= secondsNeeded) {
						break;
					}
					await this.timeout(interval * 1000);
				}
				if (!completed) {
					await this.client.rest.post(
						`/quests/${quest.id}/video-progress`,
						{
							body: { timestamp: secondsNeeded },
						},
					);
				}
				if (!onProgress) console.log(`Quest "${questName}" completed!`);
			};
			if (!onProgress) console.log(`Spoofing video for ${questName}.`);
			await fn();
		} else if (taskName === 'PLAY_ON_DESKTOP') {
			let currentLocalSec = secondsDone;
			while (!quest.isCompleted() && currentLocalSec < secondsNeeded) {
				const pct = Math.floor((currentLocalSec / secondsNeeded) * 100);
				emitProgress(pct, currentLocalSec, secondsNeeded);

				const res = await this.client.rest.post(
					`/quests/${quest.id}/heartbeat`,
					{
						body: {
							application_id: quest.config.application.id,
							terminal: false,
						},
					},
				);
				quest.updateUserStatus(res as any);

				// Wait 60 seconds while ticking progress smoothly every second
				for (let s = 0; s < 60 && currentLocalSec < secondsNeeded; s++) {
					await this.timeout(1000);
					currentLocalSec++;
					const curPct = Math.floor((currentLocalSec / secondsNeeded) * 100);
					emitProgress(curPct, currentLocalSec, secondsNeeded);
				}
			}
			const res = await this.client.rest.post(
				`/quests/${quest.id}/heartbeat`,
				{
					body: {
						application_id: quest.config.application.id,
						terminal: true,
					},
				},
			);
			quest.updateUserStatus(res as any);
			if (!onProgress) console.log(`Quest "${questName}" completed!`);
		} else if (taskName === 'STREAM_ON_DESKTOP') {
			console.log(
				'This no longer works in node for non-video quests. Use the discord desktop app to complete the',
				questName,
				'quest!',
			);
			return false;
		} else if (taskName === 'PLAY_ACTIVITY') {
			console.log(
				'This quest not supported. Use the discord desktop app to complete the',
				questName,
				'quest!',
			);
			return false;
		} else {
			console.log(
				'Unknown quest type. Use the discord desktop app to complete the',
				questName,
				'quest!',
			);
			return false;
		}
		return true;
	}
}