import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { supabase } from '../database/supabase.js';

export const data = new SlashCommandBuilder()
  .setName('addlimitcard')
  .setDescription('Add a limited edition card (Admin only)')
  .addStringOption(option =>
    option.setName('cardcode')
      .setDescription('Card code (e.g., LIM001)')
      .setRequired(true))
  .addStringOption(option =>
    option.setName('name')
      .setDescription('Card name')
      .setRequired(true))
  .addStringOption(option =>
    option.setName('group')
      .setDescription('Group name')
      .setRequired(true))
  .addIntegerOption(option =>
    option.setName('rarity')
      .setDescription('Rarity (1-5)')
      .setRequired(true)
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
  .addStringOption(option =>
    option.setName('image_url')
      .setDescription('Image URL'))
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const cardcode = interaction.options.getString('cardcode', true).toUpperCase();
  const name = interaction.options.getString('name', true);
  const group = interaction.options.getString('group', true);
  const rarity = interaction.options.getInteger('rarity', true);
  const era = interaction.options.getString('era');
  const imageUrl = interaction.options.getString('image_url');

  const { data: newCard, error } = await supabase
    .from('cards')
    .insert([{
      name,
      group,
      cardcode,
      era,
      rarity,
      is_limited: true,
      droppable: true,
      image_url: imageUrl
    }])
    .select()
    .single();

  if (error) {
    return interaction.editReply(`Error adding limited card: ${error.message}`);
  }

  const embed = new EmbedBuilder()
    .setTitle('🔒 Limited Card Added!')
    .setDescription(`Added **${name}** as a limited card. It will be harder to obtain.`)
    .addFields(
      { name: 'Code', value: cardcode },
      { name: 'Rarity', value: `${rarity}` }
    )
    .setColor(0xFFB6E1);

  await interaction.editReply({ embeds: [embed] });
}
