import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { supabase } from '../database/supabase.js';
import { isAdminUser } from '../utils/constants.js';
import { getTranslation } from '../utils/language.js';

export const data = new SlashCommandBuilder()
  .setName('deletecard')
  .setDescription('Delete a card from the database (Staff only)')
  .addIntegerOption(option =>
    option.setName('card_id')
      .setDescription('The ID of the card to delete')
      .setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction) {
  const lang = (interaction as any).userLanguage || 'en';
  if (!isAdminUser(interaction.member)) {
    return interaction.reply({ content: lang === 'es' ? '🧚 ¡Este comando es solo para Staff!' : '🧚 This command is for Staff only!', ephemeral: true });
  }

  await interaction.deferReply();
  const cardId = interaction.options.getInteger('card_id', true);

  const { data: card } = await supabase
    .from('cards')
    .select('*')
    .eq('card_id', cardId)
    .maybeSingle();

  if (!card) {
    await interaction.editReply({ content: getTranslation(lang, 'not_enough_cards') });
    return;
  }

  const { error } = await supabase
    .from('cards')
    .delete()
    .eq('card_id', cardId);

  if (error) {
    console.error('Delete error:', error);
    await interaction.editReply({ content: lang === 'es' ? '🧚 Error al eliminar la carta. Podría estar referenciada en inventarios o listados del mercado.' : '🧚 Error deleting card. It might be referenced in inventories or marketplace listings.' });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0xFFB6E1)
    .setTitle(getTranslation(lang, 'delete_title'))
    .setDescription(getTranslation(lang, 'delete_desc', { name: card.name, group: card.group }))
    .addFields(
      { name: getTranslation(lang, 'field_card_id'), value: `${cardId}` },
      { name: getTranslation(lang, 'field_rarity'), value: `${card.rarity}` }
    );

  await interaction.editReply({ embeds: [embed] });
}
