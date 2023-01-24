// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.8.17;

interface IPool {
  function coverAssets(uint256 index) external view returns (address assetAddress, uint8 decimals);
}
