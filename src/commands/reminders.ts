import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { supabase } from '../database/supabase.js';

export const data = new SlashCommandBuilder()
  .setName('reminders')
  .setDescription('Manage your command reminders');

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });
  
  const userId = interaction.user.id;
  const { data: user } = await supabase.from('users').select('*').eq('user_id', userId).maybeSingle();
  
  if (!user) {
    return interaction.editReply('Please use `/start` first!');
  }

  const settings = (user as any).reminder_settings || {};
  const commands = ['drop', 'daily', 'weekly', 'surf'];

  const getEmbed = (currentSettings: any) => {
    const description = commands.map(cmd => {
      const isEnabled = currentSettings[cmd] !== false;
      return `${isEnabled ? '✅' : '❌'} **/${cmd}**`;
    }).join('\n');

    return new EmbedBuilder()
      .setTitle('⏰ Reminder Settings')
      .setDescription('Click the buttons below to toggle reminders:\n\n' + description)
      .setColor(0xFFB6E1);
  };

  const getButtons = (currentSettings: any) => {
    const row = new ActionRowBuilder<ButtonBuilder>();
    commands.forEach(cmd => {
      const isEnabled = currentSettings[cmd] !== false;
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`remind_toggle_${cmd}`)
          .setLabel(`/${cmd}`)
          .setStyle(isEnabled ? ButtonStyle.Success : ButtonStyle.Danger)
      );
    });
    return [row];
  };

  const response = await interaction.editReply({
    embeds: [getEmbed(settings)],
    components: getButtons(settings)
  });

  const collector = response.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 60000
  });

  collector.on('collect', async i => {
    if (i.user.id !== userId) return i.reply({ content: 'Not for you!', ephemeral: true });
    
    const cmd = i.customId.replace('remind_toggle_', '');
    settings[cmd] = settings[cmd] === false;
    
    await supabase.from('users').update({ reminder_settings: settings }).eq('user_id', userId);
    
    await i.update({
      embeds: [getEmbed(settings)],
      components: getButtons(settings)
    });
  });
}
