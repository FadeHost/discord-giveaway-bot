import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { load, save } from './store.js';

export const commands = [
  new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Giveaways')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName('start').setDescription('Start a giveaway')
      .addStringOption((o) => o.setName('prize').setDescription('What is given away').setRequired(true).setMaxLength(200))
      .addStringOption((o) => o.setName('duration').setDescription('How long: 30m, 2h, 3d').setRequired(true))
      .addIntegerOption((o) => o.setName('winners').setDescription('How many winners, 1 to 20').setMinValue(1).setMaxValue(20))
      .addChannelOption((o) => o.setName('channel').setDescription('Where to post it (this channel by default)').addChannelTypes(ChannelType.GuildText)))
    .addSubcommand((s) => s.setName('end').setDescription('End a giveaway now').addStringOption((o) => o.setName('message_id').setDescription('The giveaway message id').setRequired(true)))
    .addSubcommand((s) => s.setName('reroll').setDescription('Pick new winners for an ended giveaway').addStringOption((o) => o.setName('message_id').setDescription('The giveaway message id').setRequired(true)))
    .addSubcommand((s) => s.setName('list').setDescription('The running giveaways')),
].map((c) => c.toJSON());

const UNITS = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

/** "30m", "2h", "3d", "1h30m" to milliseconds; null when it is not a duration. */
export function parseDuration(text) {
  const parts = String(text).trim().toLowerCase().match(/(\d+)\s*([smhd])/g);
  if (!parts || parts.join('').replace(/\s/g, '') !== String(text).trim().toLowerCase().replace(/\s/g, '')) return null;
  let ms = 0;
  for (const p of parts) {
    const [, n, u] = p.match(/(\d+)\s*([smhd])/);
    ms += Number(n) * UNITS[u];
  }
  return ms > 0 ? ms : null;
}

/** Winners drawn at random, no repeats, no more than there are entrants. */
export function draw(entrants, count, exclude = []) {
  const pool = entrants.filter((id) => !exclude.includes(id));
  const winners = [];
  while (winners.length < count && pool.length > 0) {
    winners.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return winners;
}

function embedFor(g) {
  const embed = new EmbedBuilder()
    .setTitle(g.prize)
    .setColor(g.ended ? 0x99aab5 : 0x57f287)
    .addFields(
      { name: g.ended ? 'Ended' : 'Ends', value: `<t:${Math.floor(g.endsAt / 1000)}:R>`, inline: true },
      { name: 'Winners', value: String(g.winnerCount), inline: true },
      { name: 'Entries', value: String(g.entrants.length), inline: true },
    )
    .setFooter({ text: `Started by ${g.hostTag}` });
  if (g.ended) {
    embed.setDescription(g.winners.length ? `Winner${g.winners.length > 1 ? 's' : ''}: ${g.winners.map((id) => `<@${id}>`).join(', ')}` : 'Nobody entered.');
  } else {
    embed.setDescription('Press the button to enter.');
  }
  return embed;
}

const row = (ended) => new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId('enter_giveaway').setLabel(ended ? 'Ended' : 'Enter').setStyle(ButtonStyle.Success).setDisabled(ended),
);

const timers = new Map();

export function schedule(client, g) {
  const wait = Math.max(0, g.endsAt - Date.now());
  if (timers.has(g.messageId)) clearTimeout(timers.get(g.messageId));
  // setTimeout takes at most ~24.8 days; longer waits are re-armed on the way.
  const step = Math.min(wait, 2_000_000_000);
  timers.set(g.messageId, setTimeout(() => {
    if (Date.now() < g.endsAt) schedule(client, g);
    else void end(client, g);
  }, step));
}

export async function end(client, g, reroll = false) {
  const data = await load();
  g = data.giveaways[g.messageId] ?? g;
  const previous = reroll ? g.winners : [];
  g.winners = draw(g.entrants, g.winnerCount, previous);
  g.ended = true;
  await save();
  timers.delete(g.messageId);
  const channel = await client.channels.fetch(g.channelId).catch(() => null);
  if (!channel) return g;
  const message = await channel.messages.fetch(g.messageId).catch(() => null);
  if (message) await message.edit({ embeds: [embedFor(g)], components: [row(true)] }).catch(() => {});
  await channel.send({
    content: g.winners.length
      ? `${reroll ? 'New winner' : 'Winner'}${g.winners.length > 1 ? 's' : ''} of **${g.prize}**: ${g.winners.map((id) => `<@${id}>`).join(', ')}`
      : `Nobody entered the giveaway for **${g.prize}**.`,
    reply: message ? { messageReference: message.id } : undefined,
  }).catch(() => {});
  return g;
}

export async function resume(client) {
  const data = await load();
  let count = 0;
  for (const g of Object.values(data.giveaways)) {
    if (!g.ended) {
      schedule(client, g);
      count++;
    }
  }
  if (count) console.log(`[giveaway-bot] ${count} giveaway(s) resumed`);
}

export async function handleCommand(interaction) {
  const data = await load();
  const sub = interaction.options.getSubcommand();

  if (sub === 'start') {
    const ms = parseDuration(interaction.options.getString('duration'));
    if (!ms || ms < 30_000) {
      await interaction.reply({ content: 'Write the duration like 30m, 2h or 3d (at least 30 seconds).', ephemeral: true });
      return;
    }
    const channel = interaction.options.getChannel('channel') ?? interaction.channel;
    const g = {
      messageId: null,
      channelId: channel.id,
      guildId: interaction.guildId,
      prize: interaction.options.getString('prize'),
      winnerCount: interaction.options.getInteger('winners') ?? 1,
      endsAt: Date.now() + ms,
      hostId: interaction.user.id,
      hostTag: interaction.user.tag,
      entrants: [],
      winners: [],
      ended: false,
    };
    const message = await channel.send({ embeds: [embedFor(g)], components: [row(false)] });
    g.messageId = message.id;
    data.giveaways[message.id] = g;
    await save();
    schedule(interaction.client, g);
    await interaction.reply({ content: `Giveaway started in <#${channel.id}>, ends <t:${Math.floor(g.endsAt / 1000)}:R>. Message id ${message.id}.`, ephemeral: true });
    return;
  }

  if (sub === 'list') {
    const running = Object.values(data.giveaways).filter((g) => !g.ended && g.guildId === interaction.guildId);
    await interaction.reply({
      content: running.length === 0 ? 'No giveaway is running.' : running.map((g) => `${g.prize}: ${g.entrants.length} entries, ends <t:${Math.floor(g.endsAt / 1000)}:R>, id ${g.messageId}`).join('\n'),
      ephemeral: true,
    });
    return;
  }

  const g = data.giveaways[interaction.options.getString('message_id').trim()];
  if (!g || g.guildId !== interaction.guildId) {
    await interaction.reply({ content: 'No giveaway with that message id. /giveaway list shows the running ones.', ephemeral: true });
    return;
  }
  if (sub === 'end') {
    if (g.ended) {
      await interaction.reply({ content: 'That giveaway has ended already; /giveaway reroll picks new winners.', ephemeral: true });
      return;
    }
    await end(interaction.client, g);
    await interaction.reply({ content: 'Ended.', ephemeral: true });
    return;
  }
  if (sub === 'reroll') {
    if (!g.ended) {
      await interaction.reply({ content: 'That giveaway is still running; end it first.', ephemeral: true });
      return;
    }
    await end(interaction.client, g, true);
    await interaction.reply({ content: 'New winners picked.', ephemeral: true });
  }
}

export async function handleButton(interaction) {
  if (interaction.customId !== 'enter_giveaway') return;
  const data = await load();
  const g = data.giveaways[interaction.message.id];
  if (!g || g.ended) {
    await interaction.reply({ content: 'This giveaway has ended.', ephemeral: true });
    return;
  }
  if (g.entrants.includes(interaction.user.id)) {
    g.entrants = g.entrants.filter((id) => id !== interaction.user.id);
    await save();
    await interaction.update({ embeds: [embedFor(g)] });
    await interaction.followUp({ content: 'You left the giveaway.', ephemeral: true });
    return;
  }
  g.entrants.push(interaction.user.id);
  await save();
  await interaction.update({ embeds: [embedFor(g)] });
  await interaction.followUp({ content: 'You are in. Press again to leave.', ephemeral: true });
}
