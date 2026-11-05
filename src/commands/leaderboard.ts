import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { supabase } from '../database/supabase.js';
import { getTranslation } from '../utils/language.js';

export const data = new SlashCommandBuilder()
  .setName('leaderboard')
  .setDescription('View the top collectors')
  .addSubcommand(subcommand =>
    subcommand
      .setName('s2ucoins')
      .setDescription('Show users with the most S2UCoins'))
  .addSubcommand(subcommand =>
    subcommand
      .setName('collection')
      .setDescription('Show users with the most unique cards'));

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const lang = (interaction as any).userLanguage || 'en';
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 's2ucoins') {
    const { data: topCoins } = await supabase
      .from('users')
      .select('user_id, coins')
      .order('coins', { ascending: false })
      .limit(10);

    const description = (await Promise.all((topCoins || []).map(async (u, i) => {
      let username = u.user_id;
      try {
        const user = await interaction.client.users.fetch(u.user_id);
        username = user.username;
      } catch (e) {}
      return getTranslation(lang, 'leaderboard_row_coins', { pos: i + 1, user: username, amount: u.coins });
    }))).join('\n');

    const embed = new EmbedBuilder()
      .setColor(0xFFB6E1)
      .setTitle(getTranslation(lang, 'leaderboard_coins'))
      .setDescription(description || getTranslation(lang, 'leaderboard_empty_coins'));

    await interaction.editReply({ embeds: [embed] });
  } else if (subcommand === 'collection') {
    const { data: topCollections } = await supabase
      .rpc('get_top_collections');

    const description = (await Promise.all((topCollections || []).map(async (u: any, i: number) => {
      let username = u.user_id;
      try {
        const user = await interaction.client.users.fetch(u.user_id);
        username = user.username;
      } catch (e) {}
      return getTranslation(lang, 'leaderboard_row_collection', { pos: i + 1, user: username, amount: u.unique_cards });
    }))).join('\n');

    const embed = new EmbedBuilder()
      .setColor(0xFFB6E1)
      .setTitle(getTranslation(lang, 'leaderboard_collection'))
      .setDescription(description || getTranslation(lang, 'leaderboard_empty_collection'));

    await interaction.editReply({ embeds: [embed] });
  }
}
