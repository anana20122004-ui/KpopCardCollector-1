export const S2U_COIN_EMOJI = '<:S2UCoin:1567745573879156806>';
export const S2U_CURRENCY_LABEL = `${S2U_COIN_EMOJI} S2UCoins`;

export function formatS2UCoins(amount: number): string {
  return `${S2U_COIN_EMOJI} **${amount.toLocaleString()}** S2UCoins`;
}
