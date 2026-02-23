import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { supabase } from '../database/supabase.js';
import { isAdminUser } from '../utils/constants.js';
import { getTranslation } from '../utils/language.js';

export const data = new SlashCommandBuilder()
  .setName('addcard')
  .setDescription('Add or edit a K-pop card (Staff only)')
  .addStringOption(option =>
    option.setName('cardcode')
      .setDescription('Card code (e.g., BP001)')
      .setRequired(true))
  .addStringOption(option =>
    option.setName('name')
      .setDescription('Card name'))
  .addStringOption(option =>
    option.setName('group')
      .setDescription('Group name'))
  .addIntegerOption(option =>
    option.setName('rarity')
      .setDescription('Rarity (1-5)')
      .addChoices(
        { name: 'Common (1)', value: 1 },
        { name: 'Uncommon (2)', value: 2 },
        { name: 'Rare (3)', value: 3 },
        { name: 'Epic (4)', value: 4 },
        { name: 'Legendary (5)', value: 5 }
      ))
  .addStringOption(option =>
    option.setName('era')
      .setDescription('Era name'))
  .addBooleanOption(option =>
    option.setName('droppable')
      .setDescription('Can it be dropped?'))
  .addStringOption(option =>
    option.setName('image_url')
      .setDescription('Image URL'));

export async function execute(interaction: ChatInputCommandInteraction) {
  const lang = (interaction as any).userLanguage || 'en';
  if (!isAdminUser(interaction.member)) {
    return interaction.reply({ content: lang === 'es' ? '🧚 ¡Este comando es solo para Staff!' : '🧚 This command is for Staff only!', ephemeral: true });
  }

  await interaction.deferReply();
  const cardcode = interaction.options.getString('cardcode', true).toUpperCase();
  const name = interaction.options.getString('name');
  const group = interaction.options.getString('group');
  const rarity = interaction.options.getInteger('rarity');
  const era = interaction.options.getString('era');
  const droppable = interaction.options.getBoolean('droppable');
  const imageUrl = interaction.options.getString('image_url');

  const { data: existing } = await supabase.from('cards').select('*').eq('cardcode', cardcode).maybeSingle();

  if (existing) {
    const updates: any = {};
    if (name) updates.name = name;
    if (group) updates.group = group;
    if (rarity) updates.rarity = rarity;
    if (era) updates.era = era;
    if (droppable !== null) updates.droppable = droppable;
    if (imageUrl) updates.image_url = imageUrl;

    const { error } = await supabase.from('cards').update(updates).eq('card_id', existing.card_id);
    if (error) return interaction.editReply(`Error: ${error.message}`);
    return interaction.editReply(getTranslation(lang, 'update_success', { type: lang === 'es' ? 'carta' : 'card', code: cardcode }));
  }

  if (!name || !group || !rarity) return interaction.editReply(getTranslation(lang, 'provide_details'));

  const { error } = await supabase.from('cards').insert([{
    name, group, cardcode, era, rarity, 
    droppable: droppable ?? true,
    image_url: imageUrl
  }]);

  if (error) return interaction.editReply(`Error: ${error.message}`);
  await interaction.editReply(getTranslation(lang, 'add_success', { type: lang === 'es' ? 'carta' : 'card', name, code: cardcode }));
}
