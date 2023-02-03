// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import { IPool, Asset } from "./../interfaces/IPool.sol";

contract PoolMock is IPool {
  address constant eth = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
  address public immutable collateral;

  constructor(address _collateral) {
    collateral = _collateral;
  }

  function getAsset(uint256 assetId) external view returns (Asset memory) {
    if (assetId == 0) {
      return Asset(eth, false, false);
    } else {
      return Asset(collateral, false, false);
    }
  }
}
