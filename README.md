# discord-qc-local

A lightweight local CLI tool to complete Discord quests and farm orbs across multiple accounts simultaneously.

## Features

- **Concurrent execution**: Runs all accounts in parallel so multiple 15-minute quests finish in 15 minutes total.
- **Orb priority**: Scans quest rewards and automatically tackles quests with the highest orb count first.
- **Clean terminal UI**: Real-time progress bars, timers, and quest summaries without console spam.
- **Simple setup**: Just drop your account tokens into `tokens.txt` (one per line).

```
┌─ Account [1/2]: @exploriot  ⚡ Farming Active
│   🎮 Quest:  "Genshin Impact" (PLAY_ON_DESKTOP)
│   🎁 Reward: 🔮 30 Orbs
│   📊 Status: [████████████░░░░░░░░░░]  50.0% (450s / 900s)
│   ⏳ Timer:  Elapsed: 07:30 | Est. Remaining: 07:30
└──────────────────────────────────────────────────────────────────────────
```

## Getting Started

### 1. Install dependencies
```bash
npm install
```

### 2. Add your tokens
Create a `tokens.txt` file (or copy `tokens.example.txt`):
```bash
cp tokens.example.txt tokens.txt
```

Add your Discord token(s), one per line:
```text
mfa.xxxxxxxxxxxxxxxxxxxxxxxxxxxx
mfa.yyyyyyyyyyyyyyyyyyyyyyyyyyyy
```

### 3. Run
```bash
npm run dev
```

## Notes
- Video quests (`WATCH_VIDEO`) advance quickly via spoofed progress timestamps.
- Play quests (`PLAY_ON_DESKTOP`) send periodic heartbeats to Discord to mimic gameplay activity.
- Automating user accounts is against Discord's Terms of Service. Use on alt accounts or at your own discretion.
