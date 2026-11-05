import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { supabase } from '../database/supabase.js';
import { mergeCardImages } from '../utils/imageUtils.js';
import { getRarityEmoji } from '../utils/cards.js';
import { getTranslation } from '../utils/language.js';

export const data = new SlashCommandBuilder()
  .setName('inventory')
  .setDescription('View your K-pop card collection')
// ... (rest of the options)
  .addUserOption(option =>
    option.setName('user')
      .setDescription('User to check inventory for (default: yourself)')
      .setRequired(false))
  .addIntegerOption(option =>
    option.setName('page')
      .setDescription('Page number (default: 1)')
      .setRequired(false)
      .setMinValue(1))
  .addIntegerOption(option =>
    option.setName('rarity')
      .setDescription('Filter by rarity (1-5)')
      .setRequired(false)
      .addChoices(
        { name: 'Common (1)', value: 1 },
        { name: 'Uncommon (2)', value: 2 },
        { name: 'Rare (3)', value: 3 },
        { name: 'Epic (4)', value: 4 },
        { name: 'Legendary (5)', value: 5 }
      ))
  .addStringOption(option =>
    option.setName('group')
      .setDescription('Filter by group name')
      .setRequired(false))
  .addStringOption(option =>
    option.setName('idol')
      .setDescription('Filter by idol/member name')
      .setRequired(false))
  .addStringOption(option =>
    option.setName('search')
      .setDescription('Search for a specific idol or group name')
      .setRequired(false))
  .addStringOption(option =>
    option.setName('era')
      .setDescription('Filter by era')
      .setRequired(false));

const CARDS_PER_PAGE = 3;

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const lang = (interaction as any).userLanguage || 'en';
  const targetUser = interaction.options.getUser('user');
  const userId = targetUser ? targetUser.id : interaction.user.id;
  const page = interaction.options.getInteger('page') || 1;
  const rarityFilter = interaction.options.getInteger('rarity');
  const groupFilter = interaction.options.getString('group');
  const idolFilter = interaction.options.getString('idol');
  const eraFilter = interaction.options.getString('era');
  const searchFilter = interaction.options.getString('search');

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (userError || !user) {
    await interaction.editReply({ content: getTranslation(lang, 'start_prompt') });
    return;
  }

  const { data: inventory } = await supabase
    .from('inventory')
    .select(`
      quantity,
      cards (
        card_id,
        name,
        group,
        era,
        rarity,
        cardcode,
        image_url,
        droppable
      )
    `)
    .eq('user_id', userId);

  if (!inventory || inventory.length === 0) {
    const embed = new EmbedBuilder()
      .setColor(0xFFB6E1)
      .setTitle(getTranslation(lang, 'inventory_title'))
      .setDescription(getTranslation(lang, 'inventory_empty'))
      .addFields({ name: getTranslation(lang, 'coins_label'), value: `${user.coins}` });

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  let filteredInventory = inventory;
  
  if (rarityFilter !== null && rarityFilter !== undefined) {
    filteredInventory = filteredInventory.filter((item: any) => item.cards.rarity === rarityFilter);
  }
  
  if (groupFilter) {
    const groups = groupFilter.split(',').map(s => s.trim().toLowerCase());
    filteredInventory = filteredInventory.filter((item: any) => 
      groups.some(g => item.cards.group.toLowerCase().includes(g))
    );
  }

  if (idolFilter) {
    const idols = idolFilter.split(',').map(s => s.trim().toLowerCase());
    filteredInventory = filteredInventory.filter((item: any) =>
      idols.some(i => item.cards.name.toLowerCase().includes(i))
    );
  }

  if (eraFilter) {
    const eras = eraFilter.split(',').map(s => s.trim().toLowerCase());
    filteredInventory = filteredInventory.filter((item: any) =>
      item.cards.era && eras.some(e => item.cards.era.toLowerCase().includes(e))
    );
  }

  if (searchFilter) {
    const search = searchFilter.toLowerCase();
    filteredInventory = filteredInventory.filter((item: any) =>
      item.cards.name.toLowerCase().includes(search) || 
      item.cards.group.toLowerCase().includes(search) ||
      (item.cards.era && item.cards.era.toLowerCase().includes(search))
    );
  }

  if (filteredInventory.length === 0) {
    const embed = new EmbedBuilder()
      .setColor(0xFFB6E1)
      .setTitle(getTranslation(lang, 'inventory_title'))
      .setDescription(getTranslation(lang, 'inventory_no_match'))
      .addFields({ name: getTranslation(lang, 'coins_label'), value: `${user.coins}` });

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  filteredInventory.sort((a: any, b: any) => {
    const groupA = a.cards.group.toLowerCase();
    const groupB = b.cards.group.toLowerCase();
    if (groupA < groupB) return -1;
    if (groupA > groupB) return 1;
    
    const nameA = a.cards.name.toLowerCase();
    const nameB = b.cards.name.toLowerCase();
    if (nameA < nameB) return -1;
    if (nameA > nameB) return 1;
    return 0;
  });

  const totalPages = Math.ceil(filteredInventory.length / CARDS_PER_PAGE);
  const validPage = Math.max(1, Math.min(page, totalPages));
  const startIndex = (validPage - 1) * CARDS_PER_PAGE;
  const pageCards = filteredInventory.slice(startIndex, startIndex + CARDS_PER_PAGE);

  const cardList = pageCards
    .map((item: any, index: number) => {
      const card = item.cards;
      const eraText = card.era ? ` • ${card.era}` : '';
      const rarityEmoji = getRarityEmoji(card.rarity);
      return getTranslation(lang, 'inventory_card_label', {
        num: index + 1,
        name: card.name,
        group: card.group,
        emoji: rarityEmoji,
        era: eraText,
        code: card.cardcode,
        qty: item.quantity
      });
    })
    .join('\n');

  let attachment = null;
  try {
    const imageUrls = pageCards.map((item: any) => item.cards.image_url).filter(Boolean);
    if (imageUrls.length > 0) {
      const mergedImageBuffer = await mergeCardImages(imageUrls);
      attachment = new AttachmentBuilder(mergedImageBuffer, { name: 'inventory_cards.png' });
    }
  } catch (error) {
    console.error('Error merging images:', error);
  }

  const isOwnInventory = userId === interaction.user.id;
  const title = isOwnInventory 
    ? getTranslation(lang, 'inventory_title') 
    : (lang === 'es' ? `Inventario de ${targetUser?.username}` : `${targetUser?.username}'s Inventory`);

  const embed = new EmbedBuilder()
      .setColor(0xF6C5D0)
    .setTitle(title)
    .setDescription(cardList)
    .setFooter({ text: getTranslation(lang, 'inventory_footer', { total: filteredInventory.length }) });

  if (attachment) {
    embed.setImage('attachment://inventory_cards.png');
  }

  const row = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`inv_prev_${userId}_${rarityFilter || 'all'}_${groupFilter || 'all'}_${eraFilter || 'all'}_${idolFilter || 'all'}_${searchFilter || 'all'}`)
        .setLabel(getTranslation(lang, 'prev_button'))
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(validPage === 1),
      new ButtonBuilder()
        .setCustomId(`inv_page`)
        .setLabel(`${validPage} / ${totalPages}`)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`inv_next_${userId}_${rarityFilter || 'all'}_${groupFilter || 'all'}_${eraFilter || 'all'}_${idolFilter || 'all'}_${searchFilter || 'all'}`)
        .setLabel(getTranslation(lang, 'next_button'))
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(validPage === totalPages)
    );

  await interaction.editReply({ 
    embeds: [embed], 
    files: attachment ? [attachment] : [], 
    components: [row] 
  });
}
