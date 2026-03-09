import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { supabase } from '../database/supabase.js';
import { isAdminUser } from '../utils/constants.js';

export const data = new SlashCommandBuilder()
  .setName('block')
  .setDescription('Block a group or artist')
  .addSubcommand(subcommand =>
    subcommand
      .setName('add')
      .setDescription('Block a group or artist from drops')
      .addStringOption(option =>
        option
          .setName('type')
          .setDescription('Type to block')
          .addChoices(
            { name: 'Group', value: 'group' },
            { name: 'Artist', value: 'artist' }
          )
          .setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName('name')
          .setDescription('Name of the group or artist to block')
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('remove')
      .setDescription('Unblock a group or artist')
      .addStringOption(option =>
        option
          .setName('type')
          .setDescription('Type to unblock')
          .addChoices(
            { name: 'Group', value: 'group' },
            { name: 'Artist', value: 'artist' }
          )
          .setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName('name')
          .setDescription('Name of the group or artist to unblock')
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('list')
      .setDescription('View all blocked groups and artists')
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const subcommand = interaction.options.getSubcommand();

  if (!isAdminUser(interaction.user.id)) {
    return interaction.editReply('❌ Only admins can use this command.');
  }

  const type = interaction.options.getString('type');
  const name = interaction.options.getString('name')?.toLowerCase();

  if (subcommand === 'add') {
    const { error } = await supabase.from('blocked_groups').insert({
      type,
      name
    });

    if (error) {
      return interaction.editReply(`❌ Error: ${error.message}`);
    }

    return interaction.editReply(`✅ Blocked **${name}** (${type})`);
  } else if (subcommand === 'remove') {
    const { error } = await supabase
      .from('blocked_groups')
      .delete()
      .eq('type', type)
      .eq('name', name);

    if (error) {
      return interaction.editReply(`❌ Error: ${error.message}`);
    }

    return interaction.editReply(`✅ Unblocked **${name}** (${type})`);
  } else if (subcommand === 'list') {
    const { data: blocked, error } = await supabase
      .from('blocked_groups')
      .select('*')
      .order('type');

    if (error || !blocked || blocked.length === 0) {
      return interaction.editReply('📋 No blocked groups or artists.');
    }

    const groups = blocked.filter((b: any) => b.type === 'group');
    const artists = blocked.filter((b: any) => b.type === 'artist');

    let list = '📋 **Blocked List:**\n\n';
    if (groups.length > 0) {
      list += '**Groups:**\n' + groups.map((g: any) => `• ${g.name}`).join('\n') + '\n\n';
    }
    if (artists.length > 0) {
      list += '**Artists:**\n' + artists.map((a: any) => `• ${a.name}`).join('\n');
    }

    return interaction.editReply(list);
  }
}
