# FadeHost Giveaway Bot

[![Deploy to FadeHost](https://fadehost.com/deploy-button.svg)](https://laplace.fadehost.com/register?intent=bot&repo=https://github.com/FadeHost/discord-giveaway-bot)

Giveaways your members enter with one button. It ends on time (even across a restart), picks the winners, and can pick again.

## Setup on FadeHost
1. Create a bot at https://discord.com/developers/applications: New Application, Bot, Reset Token.
2. Invite it with the `bot` and `applications.commands` scopes and the **Send Messages** and **Embed Links** permissions.
3. In your FadeHost panel, deploy the **Giveaway Bot** template and paste the token as `DISCORD_TOKEN`.
4. In Discord: `/giveaway start prize: A month of hosting duration: 2d winners: 1`.

## Commands
| Command | What it does |
|---|---|
| `/giveaway start prize duration [winners] [channel]` | Starts one. Duration like `30m`, `2h`, `3d`, `1h30m`. |
| `/giveaway end message_id` | Ends it now and picks the winners. |
| `/giveaway reroll message_id` | Picks new winners for an ended giveaway. |
| `/giveaway list` | The running giveaways with their ids. |

Members press **Enter** on the giveaway message; pressing again leaves.

## Environment variables
| Variable | Default | What it does |
|---|---|---|
| `DISCORD_TOKEN` | | **Required.** Your bot token. |

Giveaways are saved to the bot's persistent storage; a restart picks the timers up again.

Built and maintained by [FadeHost](https://fadehost.com). MIT licensed.
