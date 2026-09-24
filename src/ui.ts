export const colors = {
	reset: '\x1b[0m',
	bold: '\x1b[1m',
	dim: '\x1b[2m',
	italic: '\x1b[3m',
	underline: '\x1b[4m',

	// Text Colors
	white: '\x1b[38;2;248;248;242m',
	gray: '\x1b[38;2;120;130;150m',
	lightGray: '\x1b[38;2;180;190;210m',
	cyan: '\x1b[38;2;139;233;253m',
	neonGreen: '\x1b[38;2;80;250;123m',
	neonRed: '\x1b[38;2;255;85;85m',
	gold: '\x1b[38;2;255;184;108m',
	yellow: '\x1b[38;2;241;250;140m',
	blurple: '\x1b[38;2;88;101;242m',
	pink: '\x1b[38;2;255;121;198m',
};

const c = colors;

export const formatTime = (seconds: number): string => {
	const mins = Math.floor(seconds / 60);
	const secs = Math.floor(seconds % 60);
	return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

export const createProgressBar = (
	percent: number,
	width: number = 20,
	filledColor = c.cyan,
	emptyColor = c.gray,
): string => {
	const bounded = Math.min(100, Math.max(0, percent));
	const filledChars = Math.round((bounded / 100) * width);
	const emptyChars = width - filledChars;

	const filled = `${filledColor}${'█'.repeat(filledChars)}${c.reset}`;
	const empty = `${emptyColor}${'░'.repeat(emptyChars)}${c.reset}`;
	const pctText = `${c.bold}${c.white}${bounded.toFixed(1).padStart(5, ' ')}%${c.reset}`;

	return `[${filled}${empty}] ${pctText}`;
};

export const renderBanner = () => {
	console.log(`
${c.blurple}╭──────────────────────────────────────────────────────────╮
│ ${c.bold}${c.white}⚡ DISCORD QUEST AUTO-COMPLETER & ORB SNIPER             ${c.reset}${c.blurple}│
│ ${c.dim}${c.lightGray}Priority: High-Orb First • Concurrency: All Accounts     ${c.reset}${c.blurple}│
╰──────────────────────────────────────────────────────────╯${c.reset}
`);
};

export const renderTable = (headers: string[], rows: string[][]) => {
	const stripAnsi = (str: string) => str.replace(/\x1b\[[0-9;]*m/g, '');

	const colWidths = headers.map((h, i) => {
		const maxRowLen = rows.reduce(
			(max, row) => Math.max(max, stripAnsi(row[i] || '').length),
			0,
		);
		return Math.max(h.length, maxRowLen) + 2;
	});

	const pad = (text: string, width: number) => {
		const len = stripAnsi(text).length;
		const diff = width - len;
		return text + ' '.repeat(Math.max(0, diff));
	};

	const top = '┌' + colWidths.map((w) => '─'.repeat(w)).join('┬') + '┐';
	const mid = '├' + colWidths.map((w) => '─'.repeat(w)).join('┼') + '┤';
	const bot = '└' + colWidths.map((w) => '─'.repeat(w)).join('┴') + '┘';

	const headerLine =
		'│' + headers.map((h, i) => pad(` ${c.bold}${c.white}${h}${c.reset}`, colWidths[i])).join('│') + '│';

	console.log(`${c.gray}${top}${c.reset}`);
	console.log(headerLine);
	console.log(`${c.gray}${mid}${c.reset}`);

	for (const row of rows) {
		const rowLine =
			'│' + row.map((cell, i) => pad(` ${cell}${c.reset}`, colWidths[i])).join('│') + '│';
		console.log(rowLine);
	}

	console.log(`${c.gray}${bot}${c.reset}`);
};

export interface DashboardAccountState {
	name: string;
	username: string;
	status: 'authenticating' | 'scanning' | 'farming' | 'idle' | 'completed' | 'error';
	currentQuestName?: string;
	currentQuestReward?: string;
	currentQuestTaskType?: string;
	progressPct: number;
	secondsDone: number;
	secondsNeeded: number;
	elapsedSeconds: number;
	orbsEarned: number;
	itemsEarned: string[];
	decosEarned: string[];
	questsCompleted: number;
	totalQuests: number;
	errorReason?: string;
}

let lastDashboardLineCount = 0;

export const renderLiveDashboard = (accounts: DashboardAccountState[]) => {
	// Erase previous dashboard block only (preserving all previous logs/tables!)
	if (lastDashboardLineCount > 0) {
		process.stdout.write(`\x1b[${lastDashboardLineCount}A\x1b[0J`);
	}

	const lines: string[] = [];

	lines.push(`${c.bold}${c.cyan}📡 LIVE MULTI-ACCOUNT PROGRESS DASHBOARD${c.reset}`);
	lines.push('');

	accounts.forEach((acc, idx) => {
		const indexStr = `${idx + 1}/${accounts.length}`;
		let statusTag = '';

		switch (acc.status) {
			case 'authenticating':
				statusTag = `${c.yellow}⏳ Authenticating...${c.reset}`;
				break;
			case 'scanning':
				statusTag = `${c.cyan}🔍 Scanning Quests...${c.reset}`;
				break;
			case 'farming':
				statusTag = `${c.neonGreen}⚡ Farming Active${c.reset}`;
				break;
			case 'completed':
				statusTag = `${c.bold}${c.neonGreen}✅ Completed (${acc.questsCompleted}/${acc.totalQuests} Quests)${c.reset}`;
				break;
			case 'error':
				statusTag = `${c.neonRed}❌ Error: ${acc.errorReason || 'Failed'}${c.reset}`;
				break;
			default:
				statusTag = `${c.gray}💤 Idle${c.reset}`;
				break;
		}

		lines.push(`${c.blurple}╭─ ${c.bold}${c.white}Account [${indexStr}]: ${acc.username || acc.name}${c.reset}  ${statusTag}`);

		if (acc.status === 'farming' && acc.currentQuestName) {
			const estRemainingSec = Math.max(0, acc.secondsNeeded - acc.secondsDone);
			const progressBar = createProgressBar(acc.progressPct, 20);

			lines.push(`${c.blurple}│${c.reset}  🎮 Quest:  ${c.bold}${c.white}"${acc.currentQuestName}"${c.reset} ${c.dim}(${acc.currentQuestTaskType || 'DESKTOP'})${c.reset}`);
			lines.push(`${c.blurple}│${c.reset}  🎁 Reward: ${c.gold}${acc.currentQuestReward || 'Reward'}${c.reset}`);
			lines.push(`${c.blurple}│${c.reset}  📊 Status: ${progressBar} ${c.dim}(${acc.secondsDone}s / ${acc.secondsNeeded}s)${c.reset}`);
			lines.push(
				`${c.blurple}│${c.reset}  ⏳ Timer:  Elapsed: ${c.cyan}${formatTime(acc.elapsedSeconds)}${c.reset} | Est. Remaining: ${c.yellow}${formatTime(estRemainingSec)}${c.reset}`,
			);
		} else if (acc.status === 'completed') {
			lines.push(
				`${c.blurple}│${c.reset}  🎉 ${c.neonGreen}Done! Claimed: ${c.gold}🔮 ${acc.orbsEarned} Orbs${c.reset}, ${c.pink}✨ ${acc.decosEarned.length} Decos${c.reset}, ${c.cyan}🎮 ${acc.itemsEarned.length} Items${c.reset}`,
			);
		} else if (acc.status === 'error') {
			lines.push(`${c.blurple}│${c.reset}  ⚠️ ${c.neonRed}${acc.errorReason}${c.reset}`);
		}

		lines.push(`${c.blurple}╰──────────────────────────────────────────────────────────${c.reset}`);
		lines.push('');
	});

	const output = lines.join('\n') + '\n';
	lastDashboardLineCount = lines.length + 1;
	process.stdout.write(output);
};

export const clearDashboardLineState = () => {
	lastDashboardLineCount = 0;
};
