import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { supabase } from '../database/supabase.js';
import { getRandomRarity } from '../utils/cards.js';
import { getTranslation } from '../utils/language.js';
import { filterBlockedCards } from '../utils/blockFilter.js';
import { mergeCardImages } from '../utils/imageUtils.js';

const PACKS = [
  { id: '1', name: 'Stella Pack', cost: 2000, cards: 5, type: 'random' },
  { id: '2', name: 'Carmen Pack', cost: 4000, cards: 10, type: 'random' },
  { id: '3', name: 'Yuha Pack', cost: 4500, cards: 5, type: 'choice' },
  { id: '4', name: 'Juun Pack', cost: 6500, cards: 10, type: 'choice' },
  { id: '5', name: 'Ye-on Pack', cost: 25000, cards: 5, type: 'legendary' }
];

export const data = new SlashCommandBuilder()
  .setName('shop')
  .setDescription('Buy card packs')
  .addSubcommand(s => s.setName('browse').setDescription('View available packs'))
  .addSubcommand(s => s.setName('buy')
    .setDescription('Buy a pack')
    .addStringOption(o => o.setName('pack').setDescription('Pack to buy').setRequired(true).addChoices(
      { name: 'Stella Pack - 5 random (2000)', value: '1' },
      { name: 'Carmen Pack - 10 random (4000)', value: '2' },
      { name: 'Yuha Pack - 5 choice (4500)', value: '3' },
      { name: 'Juun Pack - 10 choice (6500)', value: '4' },
      { name: 'Ye-on Pack - 5 legendary (25000)', value: '5' }
    ))
    .addStringOption(o => o.setName('filter').setDescription('Filter by group or idol (for choice packs)').setRequired(false))
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const lang = (interaction as any).userLanguage || 'en';
  const sub = interaction.options.getSubcommand();
  
  if (sub === 'browse') {
    const desc = `**Stella Pack** - 5 random cards • 💫 2000\n` +
      `**Carmen Pack** - 10 random cards • 💫 4000\n` +
      `**Yuha Pack** - 5 cards (choose group/idol) • 💫 4500\n` +
      `**Juun Pack** - 10 cards (choose group/idol) • 💫 6500\n` +
      `**Ye-on Pack** - 5 legendary cards • 💫 25000`;
    const embed = new EmbedBuilder()
      .setTitle(getTranslation(lang, 'shop_title'))
      .setDescription(desc)
      .setColor(0x8b4f9f);
    return await interaction.reply({ embeds: [embed] });
  }
  
  await interaction.deferReply();
  const packId = interaction.options.getString('pack', true);
  const filter = interaction.options.getString('filter');
  const pack = PACKS.find(p => p.id === packId);
  
  if (!pack) return interaction.editReply('❌ Pack not found');
  
  const { data: user } = await supabase.from('users').select('*').eq('user_id', interaction.user.id).single();
  if (!user || (user as any).coins < (pack as any).cost) {
    return interaction.editReply(getTranslation(lang, 'shop_not_enough'));
  }
  
  const { data: allCards } = await supabase.from('cards').select('*').eq('droppable', true);
  if (!allCards || allCards.length === 0) return interaction.editReply(getTranslation(lang, 'shop_no_cards'));

  const availableCards = await filterBlockedCards(allCards, interaction.user.id);
  if (availableCards.length === 0) return interaction.editReply(getTranslation(lang, 'shop_no_cards'));

  let pulled = [];
  
  if ((pack as any).type === 'random') {
    const pulledIds = new Set<string>();
    
    for (let i = 0; i < (pack as any).cards; i++) {
      const rarity = getRandomRarity();
      let pool = availableCards.filter(c => c.rarity === rarity && !pulledIds.has(c.card_id));
      
      // If no unique cards available with this rarity, try any rarity
      if (pool.length === 0) {
        pool = availableCards.filter(c => !pulledIds.has(c.card_id));
      }
      
      // If still no unique cards, allow duplicates for this slot
      if (pool.length === 0) {
        pool = availableCards.filter(c => c.rarity === rarity);
        if (pool.length === 0) pool = availableCards;
      }
      
      const selectedCard = pool[Math.floor(Math.random() * pool.length)];
      pulled.push(selectedCard);
      pulledIds.add(selectedCard.card_id);
    }
  } else if ((pack as any).type === 'choice') {
    if (!filter) {
      return interaction.editReply('❌ Please provide a group or idol name with `/filter`');
    }
    
    const filterLower = filter.toLowerCase().trim();
    let filtered = availableCards.filter(c => {
      const groupLower = (c.group || '').toLowerCase().trim();
      const nameLower = (c.name || '').toLowerCase().trim();
      
      // Try exact match first
      if (groupLower === filterLower || nameLower === filterLower) return true;
      // Try partial match
      if (groupLower.includes(filterLower) || nameLower.includes(filterLower)) return true;
      // Try reverse - filter in group/name
      if (filterLower.includes(groupLower) || filterLower.includes(nameLower)) return true;
      return false;
    });
    
    if (filtered.length === 0) {
      return interaction.editReply(`❌ No cards found for "${filter}". Try the exact group or idol name.`);
    }
    
    for (let i = 0; i < (pack as any).cards; i++) {
      pulled.push(filtered[Math.floor(Math.random() * filtered.length)]);
    }
  } else if ((pack as any).type === 'legendary') {
    const legendaryCards = availableCards.filter(c => c.rarity === 5);
    
    if (legendaryCards.length === 0) {
      return interaction.editReply('❌ No legendary cards available');
    }
    
    for (let i = 0; i < (pack as any).cards; i++) {
      pulled.push(legendaryCards[Math.floor(Math.random() * legendaryCards.length)]);
    }
  }

  const inventoryMap = new Map<string, number>();
  
  for (const c of pulled) {
    const { data: ex } = await supabase.from('inventory').select('*').eq('user_id', interaction.user.id).eq('card_id', c.card_id).maybeSingle();
    const newQuantity = (ex ? (ex as any).quantity : 0) + 1;
    inventoryMap.set(c.card_id, newQuantity);
    
    if (ex) await supabase.from('inventory').update({ quantity: newQuantity }).eq('id', (ex as any).id);
    else await supabase.from('inventory').insert({ user_id: interaction.user.id, card_id: c.card_id, quantity: 1 });
  }

  await supabase.from('users').update({ coins: (user as any).coins - (pack as any).cost }).eq('user_id', interaction.user.id);
  
  // Build detailed card list with progressive counts
  const cardList = pulled.map((c, i) => {
    const count = inventoryMap.get(c.card_id) || 1;
    const era = c.era ? ` - ${c.era}` : '';
    return `${i + 1}. **${c.name}** (${c.group})${era}\n-# You have ${count} ${count === 1 ? 'copy' : 'copies'}`;
  }).join('\n');

  const embed = new EmbedBuilder()
    .setColor(0x8b4f9f)
    .setTitle(`✨ ${(pack as any).name} Purchased!`)
    .setDescription(cardList)
    .setFooter({ text: `💰 -${(pack as any).cost} coins • ${pulled.length} cards acquired` });
  
  // Generate merged image
  try {
    const imageUrls = pulled.map(c => c.image_url).filter(url => url);
    console.log(`Attempting to merge ${imageUrls.length} card images for shop purchase`);
    
    if (imageUrls.length > 0) {
      const mergedImage = await mergeCardImages(imageUrls, 5);
      const attachment = new AttachmentBuilder(mergedImage, { name: 'cards.png' });
      embed.setImage('attachment://cards.png');
      await interaction.editReply({ embeds: [embed], files: [attachment] });
      console.log('Successfully merged and sent shop images');
    } else {
      console.warn('No valid image URLs found for pulled cards');
      await interaction.editReply({ embeds: [embed] });
    }
  } catch (error) {
    console.error('Error merging shop images:', error);
    await interaction.editReply({ embeds: [embed] });
  }
}
