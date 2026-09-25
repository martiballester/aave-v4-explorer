// AaveKit V4 GraphQL queries. Field paths match handoff/QUERIES.md.
// Every list query takes `$chainIds` — the set comes from the chain registry
// (chains.ts) merged with the API's own `chains` list.

export const QUERY_CHAINS = /* GraphQL */ `
  query Chains {
    chains(request: { query: { filter: MAINNET_ONLY } }) {
      name
      chainId
      icon
      explorerUrl
      rpcUrl
    }
  }
`;

export const QUERY_HUBS = /* GraphQL */ `
  query Hubs($chainIds: [ChainId!]!) {
    hubs(request: { query: { chainIds: $chainIds } }) {
      id
      name
      address
      chain {
        name
        chainId
        explorerUrl
      }
      summary {
        totalSupplied {
          current {
            value
          }
        }
        totalBorrowed {
          current {
            value
          }
        }
        totalSupplyCap {
          value
        }
        totalBorrowCap {
          value
        }
        utilizationRate {
          normalized
        }
      }
    }
  }
`;

export const QUERY_HUB_ASSETS = /* GraphQL */ `
  query HubAssets($hubId: HubId!) {
    hubAssets(request: { query: { hubId: $hubId } }) {
      id
      onchainAssetId
      underlying {
        address
        info {
          symbol
          decimals
          name
          icon
          categories
        }
      }
      settings {
        feeReceiver
        liquidityFee {
          normalized
        }
        irStrategy
        reinvestmentController
        optimalUtilizationRate {
          normalized
        }
        baseBorrowRate {
          normalized
        }
        slopeBelowOptimal {
          normalized
        }
        slopeAboveOptimal {
          normalized
        }
      }
      summary {
        supplied {
          amount {
            value
          }
          exchange {
            value
          }
        }
        borrowed {
          amount {
            value
          }
          exchange {
            value
          }
        }
        availableLiquidity {
          amount {
            value
          }
          exchange {
            value
          }
        }
        utilizationRate {
          normalized
        }
        supplyApy {
          normalized
        }
        borrowApy {
          normalized
        }
        netApy {
          normalized
        }
        reservesCount
        activeReservesCount
      }
    }
  }
`;

export const QUERY_SPOKES = /* GraphQL */ `
  query Spokes($chainIds: [ChainId!]!) {
    spokes(request: { query: { chainIds: $chainIds } }) {
      id
      name
      address
      chain {
        chainId
      }
      connectedHubs {
        hub {
          id
          name
          address
        }
      }
      summary {
        totalSupplied {
          value
        }
        totalBorrowed {
          value
        }
        uniqueAssets
        connectedHubs
      }
      liquidationConfig {
        targetHealthFactor
        healthFactorForMaxBonus
        liquidationBonusFactor {
          normalized
        }
      }
    }
  }
`;

export const QUERY_RESERVES = /* GraphQL */ `
  query Reserves($spokeId: SpokeId!) {
    reserves(request: { query: { spokeId: $spokeId } }) {
      id
      onChainId
      status {
        frozen
        paused
        active
      }
      canBorrow
      canSupply
      canUseAsCollateral
      asset {
        onchainAssetId
        underlying {
          address
          info {
            symbol
            decimals
            name
            icon
            categories
          }
        }
        hub {
          address
          name
        }
      }
      settings {
        collateralFactor {
          normalized
        }
        maxLiquidationBonus {
          normalized
        }
        liquidationFee {
          normalized
        }
        collateralRisk {
          normalized
        }
        borrowable
        collateral
        suppliable
        receiveSharesEnabled
        latestDynamicConfigKey
        supplyCap {
          amount {
            value
          }
          exchange {
            value
          }
        }
        borrowCap {
          amount {
            value
          }
          exchange {
            value
          }
        }
      }
      summary {
        supplied {
          amount {
            value
          }
          exchange {
            value
          }
        }
        borrowed {
          amount {
            value
          }
          exchange {
            value
          }
        }
        supplyApy {
          normalized
        }
        borrowApy {
          normalized
        }
      }
    }
  }
`;

// Schema change (caught by smoke test): hubSpokeConfigs now requires
// per-(hub, spoke) querying. No more chainIds bulk filter.
export const QUERY_HUB_SPOKE_CONFIGS = /* GraphQL */ `
  query HubSpokeConfigs($hubId: HubId!, $spokeId: SpokeId!) {
    hubSpokeConfigs(request: { hubId: $hubId, spokeId: $spokeId }) {
      asset {
        onchainAssetId
        underlying {
          info {
            symbol
          }
        }
      }
      supplyCap {
        amount {
          value
        }
        exchange {
          value
        }
      }
      borrowCap {
        amount {
          value
        }
        exchange {
          value
        }
      }
      active
      halted
      riskPremiumThreshold {
        normalized
      }
    }
  }
`;
