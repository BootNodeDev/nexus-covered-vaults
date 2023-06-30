// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

struct Asset {
  address assetAddress;
  bool isCoverAsset;
  bool isAbandoned;
}

interface IPool {
  function getAsset(uint256 assetId) external view returns (Asset memory);
}
