import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { supabase } from '../database/supabase.js';
import { isAdminUser } from '../utils/constants.js';
import { formatS2UCoins } from '../utils/currency.js';

export const data = new SlashCommandBuilder()
  .setName('payall')
  .setDescription('Pay all registered users (Staff only)')
  .addIntegerOption(o => o.setName('amount').setDescription('S2UCoins to give each user').setRequired(true).setMinValue(1));

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!isAdminUser(interaction.member)) {
    return interaction.reply({ content: '💫 This command is for Staff only!', ephemeral: true });
  }

  await interaction.deferReply();
  const amount = interaction.options.getInteger('amount', true);

  try {
    // Get all users
    const { data: users, error: fetchError } = await supabase.from('users').select('user_id, coins');
    
    if (fetchError) {
      return interaction.editReply(`❌ Error fetching users: ${fetchError.message}`);
    }

    if (!users || users.length === 0) {
      return interaction.editReply('❌ No registered users found!');
    }

    // Update all users
    const updates = users.map(user => ({
      user_id: user.user_id,
      coins: (user.coins || 0) + amount
    }));

    for (const update of updates) {
      await supabase.from('users').update({ coins: update.coins }).eq('user_id', update.user_id);
    }

    await interaction.editReply(`✅ Paid ${formatS2UCoins(amount)} to **${users.length}** user(s)!`);
  } catch (error) {
    console.error('Error in payall:', error);
    await interaction.editReply(`❌ Error: ${String(error)}`);
  }
}
