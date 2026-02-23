import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { supabase } from '../database/supabase.js';
import { getRarityEmoji } from '../utils/cards.js';
import { getTranslation } from '../utils/language.js';

const RARITY_PRICES: { [key: number]: number } = {
  5: 10000,
  4: 7500,
  3: 5000,
  2: 2500,
  1: 1000
};

export const data = new SlashCommandBuilder()
  .setName('sell')
  .setDescription('Sell cards from your inventory')
  .addStringOption(option =>
    option.setName('cards')
      .setDescription('Card codes separated by commas (e.g., BP001, LSCW#501)')
      .setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const lang = (interaction as any).userLanguage || 'en';
  const userId = interaction.user.id;
  const cardsInput = interaction.options.getString('cards', true);

  const { data: user } = await supabase.from('users').select('*').eq('user_id', userId).maybeSingle();
  if (!user) return interaction.editReply({ content: getTranslation(lang, 'start_prompt') });

  const cardcodes = cardsInput.split(',').map(c => c.trim().toUpperCase());
  const soldCards = [];
  const failedCards = [];
  let totalCoins = 0;

  for (const code of cardcodes) {
    const { data: card } = await supabase.from('cards').select('*').eq('cardcode', code).maybeSingle();
    if (!card) {
      failedCards.push(`${code} (${lang === 'es' ? 'no encontrada' : 'not found'})`);
      continue;
    }

    const { data: inv } = await supabase.from('inventory').select('*').eq('user_id', userId).eq('card_id', card.card_id).maybeSingle();
    if (!inv || inv.quantity < 1) {
      failedCards.push(`${code} (${lang === 'es' ? 'no la posees' : "don't own"})`);
      continue;
    }

    if (inv.quantity > 1) {
      await supabase.from('inventory').update({ quantity: inv.quantity - 1 }).eq('id', inv.id);
    } else {
      await supabase.from('inventory').delete().eq('id', inv.id);
    }

    const price = RARITY_PRICES[card.rarity] || 0;
    totalCoins += price;
    soldCards.push(`**${card.name}** ${getRarityEmoji(card.rarity)} (\`${card.cardcode}\`) • ${price} ${lang === 'es' ? 'monedas' : 'coins'}`);
  }

  if (totalCoins > 0) {
    await supabase.from('users').update({ coins: user.coins + totalCoins }).eq('user_id', userId);
  }

  let description = '';
  if (soldCards.length > 0) {
    description = getTranslation(lang, 'sell_success', { list: soldCards.join('\n'), total: totalCoins });
  }
  if (failedCards.length > 0) {
    description += `\n\n` + getTranslation(lang, 'sell_failed', { list: failedCards.join('\n') });
  }

  if (!description) return interaction.editReply({ content: getTranslation(lang, 'sell_no_cards') });

  const embed = new EmbedBuilder()
    .setColor(0xff69b4)
    .setTitle(getTranslation(lang, 'sell_title'))
    .setDescription(description)
    .addFields({ name: getTranslation(lang, 'sell_field_balance'), value: `${user.coins + totalCoins} ${lang === 'es' ? 'monedas' : 'coins'}` });

  await interaction.editReply({ embeds: [embed] });
}
