import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { supabase } from '../database/supabase.js';
import { isAdminUser } from '../utils/constants.js';

export const data = new SlashCommandBuilder()
  .setName('updatecards')
  .setDescription('Update card configuration and ensure they drop correctly (Staff only)');

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!isAdminUser(interaction.member)) {
    return interaction.reply({ content: '💫 This command is for Staff only!', ephemeral: true });
  }

  await interaction.deferReply();

  try {
    const { data: cards, error: fetchError } = await supabase.from('cards').select('*');

    if (fetchError || !cards) {
      return interaction.editReply(`❌ Error fetching cards: ${fetchError?.message}`);
    }

    let updated = 0;
    let fixed = 0;
    const errors: string[] = [];

    // Update each card to ensure proper drop configuration
    for (const card of cards) {
      try {
        const updates: any = {};
        let needsUpdate = false;

        // Ensure card has required fields for dropping
        if (!card.droppable) {
          updates.droppable = true;
          needsUpdate = true;
          fixed++;
        }

        // Ensure card has a valid cardcode
        if (!card.cardcode) {
          updates.cardcode = `CARD${card.card_id}`;
          needsUpdate = true;
          fixed++;
        }

        // Update if necessary
        if (needsUpdate) {
          const { error: updateError } = await supabase
            .from('cards')
            .update(updates)
            .eq('card_id', card.card_id);

          if (updateError) {
            errors.push(`${card.cardcode || card.name}: ${updateError.message}`);
          } else {
            updated++;
          }
        }
      } catch (e) {
        errors.push(`${card.cardcode || 'Unknown'}: ${String(e)}`);
      }
    }

    // Validate final state
    const { data: finalCards } = await supabase.from('cards').select('*');
    const droppableCards = finalCards?.filter((c: any) => c.droppable === true).length || 0;
    const cardsWithImages = finalCards?.filter((c: any) => c.image_url).length || 0;

    const embed = new EmbedBuilder()
      .setColor(errors.length === 0 ? 0x00ff00 : 0xffaa00)
      .setTitle('✨ Card Update Complete')
      .addFields(
        { name: 'Total Cards', value: `${cards.length}`, inline: true },
        { name: 'Updated', value: `${updated}`, inline: true },
        { name: 'Fixed', value: `${fixed}`, inline: true },
        { name: 'Droppable Cards', value: `${droppableCards}`, inline: true },
        { name: 'Cards with Images', value: `${cardsWithImages}`, inline: true },
        { name: 'Ready for Dropping', value: `${droppableCards > 0 ? '✅ Yes' : '❌ No'}`, inline: true }
      );

    if (errors.length > 0) {
      embed.addFields({
        name: `⚠️ Issues (${errors.length})`,
        value: errors.slice(0, 5).join('\n') + (errors.length > 5 ? `\n... and ${errors.length - 5} more` : '')
      });
    } else {
      embed.setDescription('All cards configured for dropping!');
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (e) {
    await interaction.editReply(`❌ Error: ${String(e)}`);
  }
}
