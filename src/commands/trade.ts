import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { supabase } from '../database/supabase.js';
import { getTranslation } from '../utils/language.js';

export const data = new SlashCommandBuilder()
  .setName('trade')
  .setDescription('Trade cards with another user')
  .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
  .addStringOption(o => o.setName('card_id').setDescription('Card code to GIVE').setRequired(true))
  .addStringOption(o => o.setName('receive_card_id').setDescription('Card code to RECEIVE').setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction) {
  const lang = (interaction as any).userLanguage || 'en';
  const target = interaction.options.getUser('user', true);
  const giveCode = interaction.options.getString('card_id', true).toUpperCase();
  const receiveCode = interaction.options.getString('receive_card_id', true).toUpperCase();

  if (target.bot || target.id === interaction.user.id) return interaction.reply({ content: getTranslation(lang, 'error_generic'), ephemeral: true });

  await interaction.deferReply();

  const { data: ownCard } = await supabase.from('inventory').select('id, cards!inner(*)').eq('user_id', interaction.user.id).eq('cards.cardcode', giveCode).maybeSingle();
  if (!ownCard) return interaction.editReply(getTranslation(lang, 'error_not_own_card', { code: giveCode }));

  const { data: targetCard } = await supabase.from('inventory').select('id, cards!inner(*)').eq('user_id', target.id).eq('cards.cardcode', receiveCode).maybeSingle();
  if (!targetCard) return interaction.editReply(getTranslation(lang, 'error_target_not_own_card', { user: target.username, code: receiveCode }));

  const embed = new EmbedBuilder()
    .setTitle(getTranslation(lang, 'trade_proposal_title'))
    .setDescription(getTranslation(lang, 'trade_proposal_desc', { user1: interaction.user.id, user2: target.id }))
    .addFields(
      { name: getTranslation(lang, 'trade_field_giving'), value: `**${(ownCard.cards as any).name}**\n\`${giveCode}\`` },
      { name: getTranslation(lang, 'trade_field_receiving'), value: `**${(targetCard.cards as any).name}**\n\`${receiveCode}\`` }
    )
    .setColor(0xFFB6E1);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('accept_trade').setLabel(lang === 'es' ? 'Aceptar' : 'Accept').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('decline_trade').setLabel(lang === 'es' ? 'Rechazar' : 'Decline').setStyle(ButtonStyle.Danger)
  );

  const res = await interaction.editReply({ embeds: [embed], components: [row] });
  const collector = res.createMessageComponentCollector({ time: 60000 });

  collector.on('collect', async i => {
    if (i.user.id !== target.id) return i.reply({ content: lang === 'es' ? '¡No es para ti!' : 'Not for you!', ephemeral: true });
    if (i.customId === 'decline_trade') return i.update({ content: getTranslation(lang, 'trade_declined'), embeds: [], components: [] });

    await i.deferUpdate();
    const { error } = await supabase.rpc('execute_trade', { p_user1: interaction.user.id, p_user2: target.id, p_inv1_id: ownCard.id, p_inv2_id: targetCard.id });
    if (error) return i.editReply({ content: getTranslation(lang, 'trade_failed'), embeds: [], components: [] });
    await i.editReply({ content: getTranslation(lang, 'trade_accepted'), embeds: [embed.setTitle(getTranslation(lang, 'trade_completed_title'))], components: [] });
  });
}
