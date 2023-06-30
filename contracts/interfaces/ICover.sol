// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import { ICoverNFT } from "./ICoverNFT.sol";

struct PoolAllocationRequest {
  uint40 poolId;
  bool skip;
  uint256 coverAmountInAsset;
}

struct BuyCoverParams {
  uint256 coverId;
  address owner;
  uint24 productId;
  uint8 coverAsset;
  uint96 amount;
  uint32 period;
  uint256 maxPremiumInAsset;
  uint8 paymentAsset;
  uint16 commissionRatio;
  address commissionDestination;
  string ipfsData;
}

struct CoverData {
  uint24 productId;
  uint8 coverAsset;
  uint96 amountPaidOut;
}

struct CoverSegment {
  uint96 amount;
  uint32 start;
  uint32 period;
  uint32 gracePeriod;
  uint24 globalRewardsRatio;
  uint24 globalCapacityRatio;
}

struct Product {
  uint16 productType;
  address yieldTokenAddress;
  uint32 coverAssets;
  uint16 initialPriceRatio;
  uint16 capacityReductionRatio;
  bool isDeprecated;
  bool useFixedPrice;
}

struct ProductParam {
  string productName;
  uint productId;
  string ipfsMetadata;
  Product product;
  uint[] allowedPools;
}

struct ProductType {
  uint8 claimMethod;
  uint32 gracePeriod;
}

struct ProductInitializationParams {
  uint productId;
  uint8 weight;
  uint96 initialPrice;
  uint96 targetPrice;
}

interface ICover {
  function buyCover(
    BuyCoverParams calldata params,
    PoolAllocationRequest[] calldata coverChunkRequests
  ) external payable returns (uint256 coverId);

  function coverNFT() external returns (ICoverNFT);

  function coverData(uint coverId) external view returns (CoverData memory);

  function products(uint id) external view returns (Product memory);

  function coverSegmentsCount(uint coverId) external view returns (uint);

  function coverSegmentWithRemainingAmount(uint coverId, uint segmentId) external view returns (CoverSegment memory);

  function setProducts(ProductParam[] calldata params) external;

  function productsCount() external view returns (uint);

  function createStakingPool(
    bool isPrivatePool,
    uint initialPoolFee,
    uint maxPoolFee,
    ProductInitializationParams[] calldata productInitParams,
    string calldata ipfsDescriptionHash
  ) external returns (uint poolId, address stakingPoolAddress);

  function stakingPool(uint poolId) external view returns (address);
}
