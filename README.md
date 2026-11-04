# Night City Weather Bot

Discord bot that rolls Night City weather from the Cyberpunk RED Night City Weather tables: a daily report at 8 AM and on `!weather`.

## Commands
- `!weather`: roll the weather now
- `!weather force [condition] [days]`: force an ongoing weather event
- `!weather help`: list commands

## Weather feed
The bot also serves the latest report as JSON at `GET /weather` (any browser page can read it), so other tools can show the current weather. Oak's Visual Module 2077 (Foundry) shows it in the waiting room: set its "Weather feed URL" setting to `https://<your-railway-domain>/weather`.

```json
{
  "summary": "Inversion Smog", "condition": "Inversion Smog",
  "temperature": "Cool (Around 50°F/10°C)", "feel": "Cool", "tempC": 10, "tempF": 50,
  "duration": "4 Days", "season": "fall", "strange": true,
  "alert": "POLLUTION ADVISORY • Toxic smog levels critical. Breathing apparatus mandatory.",
  "ongoing": [{ "condition": "Blood Rain", "daysRemaining": 2 }],
  "date": "Wednesday, November 4, 2047", "rolledAt": "2026-11-04T13:50:00.000Z"
}
```
Before the first roll it answers 404. The latest report is kept in `latest_weather.json`.

## Environment
- `BOT_TOKEN`: Discord bot token
- `CHANNEL_ID`: channel for the daily report
- `PORT`: port for the feed (Railway sets this)
- `NC_YEAR`: in-game year on the broadcast (default 2047)
