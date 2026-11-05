import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { supabase } from '../database/supabase.js';
import { isAdminUser } from '../utils/constants.js';

export const data = new SlashCommandBuilder()
  .setName('validatecards')
  .setDescription('Validate all cards for errors (Staff only)');

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!isAdminUser(interaction.member)) {
    return interaction.reply({ content: '💫 This command is for Staff only!', ephemeral: true });
  }

  await interaction.deferReply();

  const { data: cards, error } = await supabase.from('cards').select('*');

  if (error || !cards) {
    return interaction.editReply(`❌ Error fetching cards: ${error?.message}`);
  }

  const errors: string[] = [];
  const warnings: string[] = [];
  let totalCards = cards.length;

  cards.forEach((card: any, idx: number) => {
    // Check required fields
    if (!card.card_id) errors.push(`Card ${idx}: Missing card_id`);
    if (!card.name) errors.push(`Card ${card.cardcode || idx}: Missing name`);
    if (!card.group) errors.push(`Card ${card.cardcode || idx}: Missing group`);
    if (!card.cardcode) errors.push(`Card ${idx}: Missing cardcode`);
    if (!card.rarity || card.rarity < 1 || card.rarity > 5) errors.push(`Card ${card.cardcode || idx}: Invalid rarity (must be 1-5)`);

    // Check optional but important fields
    if (!card.image_url) warnings.push(`Card ${card.cardcode || idx}: No image URL`);
    if (!card.era) warnings.push(`Card ${card.cardcode || idx}: No era set`);
    if (card.droppable === null || card.droppable === undefined) warnings.push(`Card ${card.cardcode || idx}: Droppable not set`);

    // Check for duplicates
    const duplicates = cards.filter((c: any) => c.cardcode === card.cardcode);
    if (duplicates.length > 1 && duplicates[0].card_id === card.card_id) {
      errors.push(`Card ${card.cardcode}: Duplicate cardcode found (${duplicates.length} total)`);
    }
  });

  const droppableCount = cards.filter((c: any) => c.droppable === true).length;
  const missingImageCount = cards.filter((c: any) => !c.image_url).length;

  const embed = new EmbedBuilder()
    .setColor(errors.length > 0 ? 0xF2C4C4 : (warnings.length > 0 ? 0xF3E0C1 : 0xCDECCB))
    .setTitle('🔍 Card Validation Report')
    .addFields(
      { name: 'Total Cards', value: `${totalCards}`, inline: true },
      { name: 'Droppable', value: `${droppableCount}`, inline: true },
      { name: 'Missing Images', value: `${missingImageCount}`, inline: true }
    );

  if (errors.length > 0) {
    embed.addFields({
      name: `❌ Errors (${errors.length})`,
      value: errors.slice(0, 10).join('\n') + (errors.length > 10 ? `\n... and ${errors.length - 10} more` : '')
    });
  }

  if (warnings.length > 0) {
    embed.addFields({
      name: `⚠️ Warnings (${warnings.length})`,
      value: warnings.slice(0, 5).join('\n') + (warnings.length > 5 ? `\n... and ${warnings.length - 5} more` : '')
    });
  }

  if (errors.length === 0 && warnings.length === 0) {
    embed.setDescription('✅ All cards are valid!');
  }

  await interaction.editReply({ embeds: [embed] });
}
