import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } from 'discord.js';
import { supabase } from '../database/supabase.js';
import { getRarityEmoji } from '../utils/cards.js';
import { mergeCardImages } from '../utils/imageUtils.js';

export const PAGE_SIZE = 5;

export const data = new SlashCommandBuilder()
  .setName('search')
  .setDescription('Search for cards in the database')
  .addStringOption(o => o.setName('idol').setDescription('Search by idol name').setRequired(false))
  .addStringOption(o => o.setName('group').setDescription('Filter by group').setRequired(false))
  .addStringOption(o => o.setName('era').setDescription('Filter by era').setRequired(false))
  .addIntegerOption(o => o.setName('rarity').setDescription('Filter by rarity').setRequired(false)
    .addChoices(
      { name: 'Common (1)', value: 1 },
      { name: 'Uncommon (2)', value: 2 },
      { name: 'Rare (3)', value: 3 },
      { name: 'Epic (4)', value: 4 },
      { name: 'Legendary (5)', value: 5 }
    ))
  .addUserOption(o => o.setName('designer').setDescription('Filter by designer').setRequired(false));

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const idolName = interaction.options.getString('idol');
  const groupFilter = interaction.options.getString('group');
  const eraFilter = interaction.options.getString('era');
  const rarityFilter = interaction.options.getInteger('rarity');
  const designerFilter = interaction.options.getUser('designer');

  let query = supabase.from('cards').select('*');
  if (idolName) query = query.ilike('name', `%${idolName}%`);
  if (groupFilter) query = query.ilike('group', `%${groupFilter}%`);
  if (eraFilter) query = query.ilike('era', `%${eraFilter}%`);
  if (rarityFilter) query = query.eq('rarity', rarityFilter);
  if (designerFilter) query = query.eq('designer_id', designerFilter.id);

  try {
    const { data: cards, error } = await query.order('group', { ascending: true });

    if (error) return interaction.editReply(`❌ Search error: ${error.message}`);
    if (!cards || cards.length === 0) return interaction.editReply('❌ No cards found matching your filters.');

    const idol = idolName || 'all';
    const group = groupFilter || 'all';
    const era = eraFilter || 'all';
    const rarity = rarityFilter ? String(rarityFilter) : 'all';
    const designer = designerFilter ? designerFilter.id : 'all';

    await renderSearchPage(interaction, cards, 0, idol, group, era, rarity, designer);
  } catch (e) {
    console.error('Search command error:', e);
    return interaction.editReply(`❌ Error: ${String(e)}`);
  }
}

export async function renderSearchPage(
  interaction: any,
  cards: any[],
  page: number,
  idol: string,
  group: string,
  era: string,
  rarity: string,
  designer: string
) {
  const pages = Math.ceil(cards.length / PAGE_SIZE);
  const start = page * PAGE_SIZE;
  const pageCards = cards.slice(start, start + PAGE_SIZE);

  const description = pageCards.map((c: any) => {
    const emoji = getRarityEmoji(c.rarity);
    const eraText = c.era ? ` • ${c.era}` : '';
    const designerText = c.designer_id
        ? ` • Designer: ${c.designer_id.split(',').map((id: string) => `<@${id}>`).join(', ')}`
        : '';
    return `**${c.name}** (${c.group})${eraText}${designerText}\n\`${c.cardcode}\` ${emoji}`;
  }).join('\n\n');

  const embed = new EmbedBuilder()
    .setColor(0xD8A8E8)
    .setTitle(`🔍 Card Search Results (${cards.length} found)`)
    .setDescription(description)
    .setFooter({ text: `Page ${page + 1} of ${pages}` });

  let attachment = null;
  try {
    const imageUrls = pageCards.map((c: any) => c.image_url).filter(Boolean);
    if (imageUrls.length > 0) {
      const mergedImage = await mergeCardImages(imageUrls, 5);
      attachment = new AttachmentBuilder(mergedImage, { name: 'search.png' });
      embed.setImage('attachment://search.png');
    }
  } catch (e) {
    console.error('Error merging search images:', e);
  }

  // Encode filters into button custom IDs
  const base = `search_NAV_${page}_${idol}_${group}_${era}_${rarity}_${designer}`;

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${base}_prev`)
      .setLabel('◀ Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId(`${base}_page`)
      .setLabel(`${page + 1} / ${pages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`${base}_next`)
      .setLabel('Next ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === pages - 1)
  );

  await interaction.editReply({
    embeds: [embed],
    files: attachment ? [attachment] : [],
    components: pages > 1 ? [row] : []
  });
}
