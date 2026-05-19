// AaveKit V4 GraphQL queries. Field paths match handoff/QUERIES.md.

export const QUERY_HUBS = /* GraphQL */ `
  query Hubs {
    hubs(request: { query: { chainIds: [1] } }) {
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
  query Spokes {
    spokes(request: { query: { chainIds: [1] } }) {
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

export const QUERY_HUB_SPOKE_CONFIGS = /* GraphQL */ `
  query HubSpokeConfigs {
    hubSpokeConfigs(request: { query: { chainIds: [1] } }) {
      hub {
        id
        name
        address
      }
      spoke {
        id
        name
        address
      }
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
