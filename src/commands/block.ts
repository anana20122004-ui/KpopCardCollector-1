import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { supabase } from '../database/supabase.js';

export const data = new SlashCommandBuilder()
  .setName('block')
  .setDescription('Block artists you dont want to get')
  .addSubcommand(subcommand =>
    subcommand
      .setName('add')
      .setDescription('Block an artist from drops')
      .addStringOption(option =>
        option
          .setName('artist')
          .setDescription('Name of the artist to block')
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('remove')
      .setDescription('Unblock an artist')
      .addStringOption(option =>
        option
          .setName('artist')
          .setDescription('Name of the artist to unblock')
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('list')
      .setDescription('View your blocked artists')
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const userId = interaction.user.id;
  const subcommand = interaction.options.getSubcommand();
  const artist = interaction.options.getString('artist')?.toLowerCase();

  if (subcommand === 'add') {
    const { error } = await supabase.from('user_blocked_artists').insert({
      user_id: userId,
      artist_name: artist
    });

    if (error) {
      return interaction.editReply(`❌ Error: ${error.message}`);
    }

    return interaction.editReply(`✅ Blocked **${artist}**`);
  } else if (subcommand === 'remove') {
    const { error } = await supabase
      .from('user_blocked_artists')
      .delete()
      .eq('user_id', userId)
      .eq('artist_name', artist);

    if (error) {
      return interaction.editReply(`❌ Error: ${error.message}`);
    }

    return interaction.editReply(`✅ Unblocked **${artist}**`);
  } else if (subcommand === 'list') {
    const { data: blocked, error } = await supabase
      .from('user_blocked_artists')
      .select('artist_name')
      .eq('user_id', userId)
      .order('artist_name');

    if (error || !blocked || blocked.length === 0) {
      return interaction.editReply('📋 You have no blocked artists.');
    }

    const list = '📋 **Your Blocked Artists:**\n' + blocked.map((b: any) => `• ${b.artist_name}`).join('\n');
    return interaction.editReply(list);
  }
}
