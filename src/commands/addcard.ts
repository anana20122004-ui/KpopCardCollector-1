import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { supabase } from '../database/supabase.js';
import { isAdminUser } from '../utils/constants.js';
import { getTranslation } from '../utils/language.js';
import { getRarityEmoji } from '../utils/cards.js';

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
      .setDescription('Image URL'))
  .addStringOption(option =>
    option.setName('new_cardcode')
      .setDescription('Change card code (for existing cards only)'));

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
  const newCardcode = interaction.options.getString('new_cardcode')?.toUpperCase();

  const { data: existing } = await supabase.from('cards').select('*').eq('cardcode', cardcode).maybeSingle();

  if (existing) {
    const updates: any = {};
    if (name) updates.name = name;
    if (group) updates.group = group;
    if (rarity) updates.rarity = rarity;
    if (era) updates.era = era;
    if (droppable !== null) updates.droppable = droppable;
    if (imageUrl) updates.image_url = imageUrl;
    if (newCardcode) updates.cardcode = newCardcode;

    const { error } = await supabase.from('cards').update(updates).eq('card_id', existing.card_id);
    if (error) return interaction.editReply(`Error: ${error.message}`);
    const displayCode = newCardcode || cardcode;
    return interaction.editReply(getTranslation(lang, 'update_success', { type: lang === 'es' ? 'carta' : 'card', code: displayCode }));
  }

  if (!name || !group || !rarity) return interaction.editReply(getTranslation(lang, 'provide_details'));

  const { error } = await supabase.from('cards').insert([{
    name, group, cardcode, era, rarity, 
    droppable: droppable ?? true,
    image_url: imageUrl
  }]);

  if (error) return interaction.editReply(`Error: ${error.message}`);
  
  const successMsg = getTranslation(lang, 'add_success', { type: lang === 'es' ? 'carta' : 'card', name: name || existing?.name || 'Unknown', code: cardcode });
  
  const adminEmbed = new EmbedBuilder()
    .setColor(0xff69b4)
    .setTitle(successMsg)
    .setDescription(getTranslation(lang, 'viewcard_desc', { 
      name: name || existing?.name || 'Unknown', 
      group: group || existing?.group || 'Unknown', 
      emoji: getRarityEmoji(rarity || existing?.rarity || 1), 
      era: (era || existing?.era) || 'N/A', 
      code: cardcode, 
      qty: '' 
    }))
    .setFooter({ text: getTranslation(lang, 'viewcard_footer', { 
      rarity: rarity || existing?.rarity || 1, 
      droppable: (droppable ?? existing?.droppable ?? true) ? (lang === 'es' ? 'Sí' : 'Yes') : (lang === 'es' ? 'No' : 'No') 
    }) });

  const finalImageUrl = imageUrl || existing?.image_url;
  if (finalImageUrl) adminEmbed.setImage(finalImageUrl);

  await interaction.editReply({ embeds: [adminEmbed] });

  // Showcase the new card in the specified channel
  const showcaseChannelId = '1479108638055334105';
  try {
    const showcaseChannel = await interaction.client.channels.fetch(showcaseChannelId);
    if (showcaseChannel && showcaseChannel.isTextBased()) {
      const showcaseEmbed = new EmbedBuilder()
        .setColor(0xff69b4)
        .setTitle(lang === 'es' ? '✨ ¡Nueva Carta Añadida!' : '✨ New Card Added!')
        .setDescription(getTranslation(lang, 'viewcard_desc', { 
          name: name || existing?.name || 'Unknown', 
          group: group || existing?.group || 'Unknown', 
          emoji: getRarityEmoji(rarity || existing?.rarity || 1), 
          era: (era || existing?.era) || 'N/A', 
          code: cardcode, 
          qty: '' 
        }))
        .setFooter({ text: getTranslation(lang, 'viewcard_footer', { 
          rarity: rarity || existing?.rarity || 1, 
          droppable: (droppable ?? existing?.droppable ?? true) ? (lang === 'es' ? 'Sí' : 'Yes') : (lang === 'es' ? 'No' : 'No') 
        }) });

      if (finalImageUrl) showcaseEmbed.setImage(finalImageUrl);
      
      // Use any to bypass TS compilation error since we've checked isTextBased()
      await (showcaseChannel as any).send({ embeds: [showcaseEmbed] });
    }
  } catch (err) {
    console.error('Error sending showcase message:', err);
  }
}
