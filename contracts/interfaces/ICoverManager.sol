// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.8.17;

import { BuyCoverParams, PoolAllocationRequest } from "./ICover.sol";

interface ICoverManager {
  function cover() external returns (address);

  function buyCover(
    BuyCoverParams calldata params,
    PoolAllocationRequest[] calldata coverChunkRequests
  ) external returns (uint256 coverId);

  function withdraw(address _asset, uint256 _amount, address _to) external;

  function isCoverExpired(uint256 _coverId) external view returns (bool);

  function getActiveCoverAmount(uint256 _coverId) external view returns (uint96);

  function redeemCover(
    uint104 incidentId,
    uint32 coverId,
    uint256 segmentId,
    uint256 depeggedTokens,
    address payable payoutAddress,
    bytes calldata optionalParams
  ) external returns (uint256 payoutAmount, uint8 coverAsset);
}
