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
      .setDescription('Change card code (for existing cards only)'))
  .addUserOption(option =>
    option.setName('designer')
      .setDescription('Designer user'));

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
  const designer = interaction.options.getUser('designer');

  const { data: existing } = await supabase.from('cards').select('*').eq('cardcode', cardcode).maybeSingle();

  if (existing) {
    const updates: any = {};
    const changes: Array<{ field: string; before: string; after: string }> = [];

    if (name && name !== existing.name) {
      updates.name = name;
      changes.push({ field: 'Name', before: existing.name, after: name });
    }
    if (group && group !== existing.group) {
      updates.group = group;
      changes.push({ field: 'Group', before: existing.group, after: group });
    }
    if (rarity && rarity !== existing.rarity) {
      updates.rarity = rarity;
      changes.push({ field: 'Rarity', before: String(existing.rarity), after: String(rarity) });
    }
    if (era && era !== existing.era) {
      updates.era = era;
      changes.push({ field: 'Era', before: existing.era || 'N/A', after: era });
    }
    if (droppable !== null && droppable !== existing.droppable) {
      updates.droppable = droppable;
      changes.push({ field: 'Droppable', before: String(existing.droppable), after: String(droppable) });
    }
    if (imageUrl && imageUrl !== existing.image_url) {
      updates.image_url = imageUrl;
      changes.push({ field: 'Image URL', before: existing.image_url || 'None', after: imageUrl });
    }
    if (newCardcode && newCardcode !== existing.cardcode) {
      updates.cardcode = newCardcode;
      changes.push({ field: 'Card Code', before: existing.cardcode, after: newCardcode });
    }
    if (designer && designer.id !== existing.designer_id) {
      updates.designer_id = designer.id;
      changes.push({ field: 'Designer', before: existing.designer_id || 'None', after: `<@${designer.id}>` });
    }

    // If no updates, notify user
    if (Object.keys(updates).length === 0) {
      return interaction.editReply(`ℹ️ No changes detected. All values are the same as the existing card.`);
    }

    const { error } = await supabase.from('cards').update(updates).eq('card_id', existing.card_id);
    if (error) return interaction.editReply(`Error: ${error.message}`);

    const displayCode = newCardcode || cardcode;
    const changesList = changes.map(c => `**${c.field}:** \`${c.before}\` → \`${c.after}\``).join('\n');

    const embed = new EmbedBuilder()
      .setColor(0x8b4f9f)
      .setTitle(`✨ Card Updated: ${displayCode}`)
      .setDescription(changesList)
      .setFooter({ text: `${changes.length} field(s) updated` });

    return interaction.editReply({ embeds: [embed] });
  }

  if (!name || !group || !rarity) return interaction.editReply(getTranslation(lang, 'provide_details'));

  const { error } = await supabase.from('cards').insert([{
    name, group, cardcode, era, rarity, 
    droppable: droppable ?? true,
    image_url: imageUrl,
    designer_id: designer?.id || null
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
