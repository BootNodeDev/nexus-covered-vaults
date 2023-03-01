// SPDX-License-Identifier: UNLICENSED

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

interface ICover {
  function buyCover(
    BuyCoverParams calldata params,
    PoolAllocationRequest[] calldata coverChunkRequests
  ) external payable returns (uint256 coverId);

  function coverNFT() external returns (ICoverNFT);
}
