import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { supabase } from '../database/supabase.js';

const OWNER_ID = '1403958587843149937';

export const data = new SlashCommandBuilder()
  .setName('blockstaff')
  .setDescription('Block or unblock staff from using /addcard (Owner only)')
  .addSubcommand(sub =>
    sub.setName('add')
      .setDescription('Block a staff member')
      .addUserOption(option =>
        option.setName('user')
          .setDescription('Staff member to block')
          .setRequired(true))
      .addStringOption(option =>
        option.setName('reason')
          .setDescription('Reason for blocking')
          .setRequired(false)))
  .addSubcommand(sub =>
    sub.setName('remove')
      .setDescription('Unblock a staff member')
      .addUserOption(option =>
        option.setName('user')
          .setDescription('Staff member to unblock')
          .setRequired(true)))
  .addSubcommand(sub =>
    sub.setName('list')
      .setDescription('View all blocked staff'));

export async function execute(interaction: ChatInputCommandInteraction) {
  // Owner check
  if (interaction.user.id !== OWNER_ID) {
    return interaction.reply({
      content: '❌ This command is owner only!',
      ephemeral: true
    });
  }

  await interaction.deferReply();

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'add') {
    const user = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') || 'No reason provided';

    const { error } = await supabase
      .from('blocked_staff')
      .insert({
        staff_id: user.id,
        blocked_by: interaction.user.id,
        reason: reason
      });

    if (error) {
      if (error.message.includes('duplicate')) {
        return interaction.editReply(`⚠️ ${user.username} is already blocked!`);
      }
      return interaction.editReply(`❌ Error: ${error.message}`);
    }

    const embed = new EmbedBuilder()
      .setColor(0xff4444)
      .setTitle('✅ Staff Member Blocked')
      .addFields(
        { name: 'User', value: `${user.username} (${user.id})` },
        { name: 'Reason', value: reason }
      )
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  }

  if (subcommand === 'remove') {
    const user = interaction.options.getUser('user', true);

    const { error } = await supabase
      .from('blocked_staff')
      .delete()
      .eq('staff_id', user.id);

    if (error) {
      return interaction.editReply(`❌ Error: ${error.message}`);
    }

    const embed = new EmbedBuilder()
      .setColor(0x44ff44)
      .setTitle('✅ Staff Member Unblocked')
      .addFields(
        { name: 'User', value: `${user.username} (${user.id})` }
      )
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  }

  if (subcommand === 'list') {
    const { data: blocked, error } = await supabase
      .from('blocked_staff')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return interaction.editReply(`❌ Error: ${error.message}`);
    }

    if (!blocked || blocked.length === 0) {
      return interaction.editReply('✅ No staff members are currently blocked.');
    }

    const description = blocked
      .map((b: any) => `• <@${b.staff_id}> - ${b.reason || 'No reason'}`)
      .join('\n');

    const embed = new EmbedBuilder()
      .setColor(0x8b4f9f)
      .setTitle(`🚫 Blocked Staff (${blocked.length})`)
      .setDescription(description)
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  }
}
