import fs from 'fs';
import path from 'path';

export type DcAccount = {
	id: string;
	name: string;
	token: string;
	spoof?: string;
};

export const loadAccounts = (): DcAccount[] => {
	const rootDir = path.join(__dirname, '..');
	const tokensTxtPath = path.join(rootDir, 'tokens.txt');
	const accountsJsonPath = path.join(rootDir, 'accounts.json');

	// 1. Try tokens.txt first
	if (fs.existsSync(tokensTxtPath)) {
		const rawContent = fs.readFileSync(tokensTxtPath, 'utf-8');
		const lines = rawContent
			.split(/\r?\n/)
			.map((l) => l.trim())
			.filter((l) => l.length > 0 && !l.startsWith('#'));

		if (lines.length > 0) {
			return lines.map((line, index) => {
				const id = String(index + 1);
				// Check for format "Name:token" or "email:password:token"
				const colonIdx = line.lastIndexOf(':');
				if (colonIdx !== -1 && colonIdx < line.length - 1) {
					const possibleToken = line.substring(colonIdx + 1).trim();
					// If the last segment looks like a token (base64-ish or len > 20)
					if (possibleToken.length >= 20) {
						const prefix = line.substring(0, colonIdx).trim();
						return {
							id,
							name: prefix || `Account-${id}`,
							token: possibleToken,
						};
					}
				}
				// Otherwise plain token string
				return {
					id,
					name: `Account-${id}`,
					token: line.replace(/["']/g, '').trim(),
				};
			});
		}
	}

	// 2. Fallback to accounts.json
	if (fs.existsSync(accountsJsonPath)) {
		try {
			const data = JSON.parse(fs.readFileSync(accountsJsonPath, 'utf-8'));
			if (Array.isArray(data.accounts)) {
				return data.accounts;
			}
		} catch (err: any) {
			console.error(`⚠️ Failed to parse accounts.json: ${err.message}`);
		}
	}

	return [];
};
