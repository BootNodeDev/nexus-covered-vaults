// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.8.17;

import { BuyCoverParams, PoolAllocationRequest } from "./ICover.sol";

interface ICoverManager {
  function buyCover(
    BuyCoverParams calldata params,
    PoolAllocationRequest[] calldata coverChunkRequests
  ) external payable returns (uint256 coverId);

  function withdraw(address _asset, uint256 _amount, address _to) external;

  function isCoverExpired(uint256 _coverId) external view returns (bool);

  function getActiveCoverAmount(uint256 _coverId) external view returns (uint96);
}
