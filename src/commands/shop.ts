import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { supabase } from '../database/supabase.js';
import { getRandomRarity } from '../utils/cards.js';
import { getTranslation } from '../utils/language.js';

const PACKS = [
  { id: '1', name: 'Magic Seeds', cost: 500, cards: 1 },
  { id: '2', name: 'Glow Spores', cost: 1000, cards: 2 }
];

export const data = new SlashCommandBuilder()
  .setName('shop')
  .setDescription('Buy packs')
  .addSubcommand(s => s.setName('browse').setDescription('View packs'))
  .addSubcommand(s => s.setName('buy').setDescription('Buy pack').addStringOption(o => o.setName('pack').setDescription('Pack').setRequired(true).addChoices(
    { name: 'Magic Seeds (500)', value: '1' }, { name: 'Glow Spores (1000)', value: '2' }
  )));

export async function execute(interaction: ChatInputCommandInteraction) {
  const lang = (interaction as any).userLanguage || 'en';
  const sub = interaction.options.getSubcommand();
  if (sub === 'browse') {
    const embed = new EmbedBuilder().setTitle(getTranslation(lang, 'shop_title')).setDescription(PACKS.map(p => `**${p.name}** - ${p.cost} ${lang === 'es' ? 'monedas' : 'coins'}`).join('\n'));
    return interaction.reply({ embeds: [embed] });
  }
  
  await interaction.deferReply();
  const packId = interaction.options.getString('pack', true);
  const pack = PACKS.find(p => p.id === packId);
  const { data: user } = await supabase.from('users').select('*').eq('user_id', interaction.user.id).single();
  
  if (!user || (user as any).coins < (pack as any).cost) return interaction.editReply(getTranslation(lang, 'shop_not_enough'));
  
  const { data: cards } = await supabase.from('cards').select('*').eq('droppable', true);
  if (!cards || cards.length === 0) return interaction.editReply(getTranslation(lang, 'shop_no_cards'));

  const pulled = [];
  for (let i = 0; i < (pack as any).cards; i++) {
    const rarity = getRandomRarity();
    let pool = cards.filter(c => c.rarity === rarity);
    if (pool.length === 0) pool = cards;
    pulled.push(pool[Math.floor(Math.random() * pool.length)]);
  }

  for (const c of pulled) {
    const { data: ex } = await supabase.from('inventory').select('*').eq('user_id', interaction.user.id).eq('card_id', c.card_id).maybeSingle();
    if (ex) await supabase.from('inventory').update({ quantity: (ex as any).quantity + 1 }).eq('id', (ex as any).id);
    else await supabase.from('inventory').insert({ user_id: interaction.user.id, card_id: c.card_id, quantity: 1 });
  }

  await supabase.from('users').update({ coins: (user as any).coins - (pack as any).cost }).eq('user_id', interaction.user.id);
  await interaction.editReply(getTranslation(lang, 'shop_bought', { pack: (pack as any).name, list: pulled.map(c => c.name).join(', ') }));
}
