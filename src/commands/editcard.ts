import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { supabase } from '../database/supabase.js';
import { isAdminUser } from '../utils/constants.js';
import { getTranslation } from '../utils/language.js';

export const data = new SlashCommandBuilder()
  .setName('editcard')
  .setDescription('Edit a card (Staff only)')
  .addStringOption(option =>
    option.setName('cardcode')
      .setDescription('Card code to edit')
      .setRequired(true))
  .addStringOption(option =>
    option.setName('name')
      .setDescription('New name'))
  .addStringOption(option =>
    option.setName('group')
      .setDescription('New group'))
  .addIntegerOption(option =>
    option.setName('rarity')
      .setDescription('New rarity')
      .addChoices(
        { name: '1', value: 1 }, { name: '2', value: 2 }, { name: '3', value: 3 }, { name: '4', value: 4 }, { name: '5', value: 5 }
      ));

export async function execute(interaction: ChatInputCommandInteraction) {
  const lang = (interaction as any).userLanguage || 'en';
  if (!isAdminUser(interaction.member)) {
    return interaction.reply({ content: lang === 'es' ? '🧚 ¡Este comando es solo para Staff!' : '🧚 This command is for Staff only!', ephemeral: true });
  }

  await interaction.deferReply();
  const code = interaction.options.getString('cardcode', true).toUpperCase();
  const name = interaction.options.getString('name');
  const group = interaction.options.getString('group');
  const rarity = interaction.options.getInteger('rarity');

  const { data: card } = await supabase.from('cards').select('*').eq('cardcode', code).maybeSingle();
  if (!card) return interaction.editReply(getTranslation(lang, 'not_enough_cards'));

  const updates: any = {};
  if (name) updates.name = name;
  if (group) updates.group = group;
  if (rarity) updates.rarity = rarity;

  if (Object.keys(updates).length === 0) return interaction.editReply(getTranslation(lang, 'nothing_to_update'));

  const { error } = await supabase.from('cards').update(updates).eq('card_id', card.card_id);
  if (error) return interaction.editReply(`Error: ${error.message}`);

  await interaction.editReply(getTranslation(lang, 'update_success', { type: lang === 'es' ? 'carta' : 'card', code }));
}
