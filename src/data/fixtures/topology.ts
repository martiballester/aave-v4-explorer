// Static topology + asset metadata — Phase 2 will replace these with live fetches.
// Ported verbatim from handoff/prototype/data.js. Editorial fields (tag, color,
// type, name) live here because they are not on-chain.

import type { Topology } from '../types';

const AV = 'https://app.aave.com/icons/tokens/';

export const topology: Topology = {
  hubs: [
    {
      id: 'plus',
      label: 'Plus',
      tag: 'Risk-return',
      color: '#D88E5A',
      spokes: [
        {
          id: 'plus-ethena',
          label: 'Ethena Ecosystem',
          type: 'General',
          collateral: ['PT-sUSDe', 'PT-USDe', 'sUSDe', 'USDe'],
          borrowable: ['USDT', 'USDC', 'USDe', 'GHO', 'cUSDT', 'cUSDC', 'cfrxUSD', 'cRLUSD'],
        },
        {
          id: 'plus-correlated',
          label: 'Ethena Correlated',
          type: 'e-Mode',
          collateral: ['PT-sUSDe', 'PT-USDe', 'sUSDe', 'USDe'],
          borrowable: ['USDe'],
        },
        {
          id: 'plus-usdg-correlated',
          label: 'USDG Correlated',
          type: 'e-Mode',
          collateral: ['PT-USDG'],
          borrowable: ['cUSDG'],
        },
      ],
    },
    {
      id: 'prime',
      label: 'Prime',
      tag: 'Low risk',
      color: '#6FB7AE',
      spokes: [
        {
          id: 'prime-bluechip',
          label: 'Bluechip',
          type: 'General',
          collateral: ['wETH', 'wstETH', 'wBTC', 'cbBTC'],
          borrowable: ['USDT', 'USDC', 'GHO', 'cUSDT', 'cUSDC', 'cUSDG', 'cRLUSD', 'cEURC'],
        },
      ],
    },
    {
      id: 'core',
      label: 'Core',
      tag: 'Risk-adjusted',
      color: '#C9B68C',
      spokes: [
        {
          id: 'core-main',
          label: 'Main',
          type: 'General',
          collateral: ['wETH', 'wstETH', 'weETH', 'wBTC', 'cbBTC', 'USDT', 'USDC', 'LINK', 'AAVE'],
          borrowable: ['wBTC', 'cbBTC', 'wETH', 'USDT', 'USDC', 'USDG', 'RLUSD', 'frxUSD', 'GHO', 'EURC', 'cUSDe'],
        },
        { id: 'core-lido', label: 'Lido e-Mode', type: 'e-Mode', collateral: ['wstETH'], borrowable: ['wETH'] },
        { id: 'core-etherfi', label: 'EtherFi e-Mode', type: 'e-Mode', collateral: ['weETH'], borrowable: ['wETH'] },
        { id: 'core-kelp', label: 'Kelp e-Mode', type: 'e-Mode', collateral: ['rsETH'], borrowable: ['wETH'] },
        { id: 'core-lombard', label: 'Lombard BTC', type: 'e-Mode', collateral: ['LBTC'], borrowable: ['wBTC', 'cbBTC'] },
        {
          id: 'core-gold',
          label: 'Gold',
          type: 'Specialty',
          collateral: ['XAUt'],
          borrowable: ['USDT', 'USDC', 'USDG', 'RLUSD', 'frxUSD', 'GHO', 'EURC'],
        },
        {
          id: 'core-forex',
          label: 'Forex',
          type: 'Specialty',
          collateral: ['USDT', 'USDC', 'EURC'],
          borrowable: ['USDT', 'USDC', 'USDG', 'RLUSD', 'frxUSD', 'GHO', 'EURC'],
        },
      ],
    },
  ],
  creditLines: [
    { from: 'core', to: 'prime', toSpoke: 'prime-bluechip', assets: ['cUSDT', 'cUSDC', 'cUSDG', 'cRLUSD', 'cEURC'] },
    { from: 'core', to: 'plus', toSpoke: 'plus-ethena', assets: ['cUSDT', 'cUSDC', 'cfrxUSD', 'cRLUSD'] },
    { from: 'core', to: 'plus', toSpoke: 'plus-usdg-correlated', assets: ['cUSDG'] },
    { from: 'plus', to: 'core', toSpoke: 'core-main', assets: ['cUSDe'] },
  ],
  HUB_NAMES: { core: 'Core', prime: 'Prime', plus: 'Plus' },
  assetMeta: {
    wETH: { type: 'eth', color: '#627EEA', name: 'Wrapped Ether', icon: AV + 'weth.svg' },
    wstETH: { type: 'eth', color: '#627EEA', name: 'Wrapped stETH', icon: AV + 'wsteth.svg' },
    weETH: { type: 'eth', color: '#627EEA', name: 'Wrapped eETH', icon: AV + 'weeth.svg' },
    rsETH: { type: 'eth', color: '#627EEA', name: 'rsETH', icon: AV + 'rseth.svg' },
    wBTC: { type: 'btc', color: '#F7931A', name: 'Wrapped BTC', icon: AV + 'wbtc.svg' },
    cbBTC: { type: 'btc', color: '#F7931A', name: 'Coinbase BTC', icon: AV + 'cbbtc.svg' },
    LBTC: { type: 'btc', color: '#F7931A', name: 'Lombard BTC', icon: AV + 'lbtc.svg' },
    USDT: { type: 'stable', color: '#26A17B', name: 'Tether', icon: AV + 'usdt.svg' },
    USDC: { type: 'stable', color: '#2775CA', name: 'USD Coin', icon: AV + 'usdc.svg' },
    USDG: { type: 'stable', color: '#26A17B', name: 'USDG', icon: AV + 'usdg.svg' },
    RLUSD: { type: 'stable', color: '#26A17B', name: 'RLUSD', icon: AV + 'rlusd.svg' },
    frxUSD: { type: 'stable', color: '#26A17B', name: 'frxUSD', icon: AV + 'frax.svg' },
    GHO: { type: 'stable', color: '#26A17B', name: 'GHO', icon: AV + 'gho.svg' },
    USDe: { type: 'stable', color: '#26A17B', name: 'USDe', icon: AV + 'usde.svg' },
    sUSDe: { type: 'stable', color: '#26A17B', name: 'sUSDe', icon: AV + 'susde.svg' },
    EURC: { type: 'eur', color: '#0052B4', name: 'EURC', icon: AV + 'eurc.svg' },
    LINK: { type: 'other', color: '#335DD2', name: 'Chainlink', icon: AV + 'link.svg' },
    AAVE: { type: 'other', color: '#9CA3AF', name: 'Aave', icon: AV + 'aave.svg' },
    XAUt: { type: 'gold', color: '#FFD700', name: 'Tether Gold', icon: AV + 'xaut.svg' },
    'PT-sUSDe': { type: 'pt', color: '#B89BD9', name: 'PT sUSDe', icon: AV + 'ptsusde.svg' },
    'PT-USDe': { type: 'pt', color: '#B89BD9', name: 'PT USDe', icon: AV + 'ptusde.svg' },
    'PT-USDG': { type: 'pt', color: '#B89BD9', name: 'PT USDG', icon: AV + 'ptusdg.svg' },
    cUSDT: { type: 'credit', color: '#26A17B', name: 'Credit USDT', icon: AV + 'usdt.svg' },
    cUSDC: { type: 'credit', color: '#2775CA', name: 'Credit USDC', icon: AV + 'usdc.svg' },
    cUSDG: { type: 'credit', color: '#26A17B', name: 'Credit USDG', icon: AV + 'usdg.svg' },
    cRLUSD: { type: 'credit', color: '#26A17B', name: 'Credit RLUSD', icon: AV + 'rlusd.svg' },
    cEURC: { type: 'credit', color: '#0052B4', name: 'Credit EURC', icon: AV + 'eurc.svg' },
    cfrxUSD: { type: 'credit', color: '#26A17B', name: 'Credit frxUSD', icon: AV + 'frax.svg' },
    cUSDe: { type: 'credit', color: '#26A17B', name: 'Credit USDe', icon: AV + 'usde.svg' },
  },
};
