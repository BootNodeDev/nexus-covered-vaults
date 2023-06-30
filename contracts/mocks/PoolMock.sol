// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import { IPool, Asset } from "./../interfaces/IPool.sol";

contract PoolMock is IPool {
  address public constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
  address public immutable collateral;

  constructor(address _collateral) {
    collateral = _collateral;
  }

  function getAsset(uint256 assetId) external view returns (Asset memory) {
    if (assetId == 0) {
      return Asset(ETH, false, false);
    } else {
      return Asset(collateral, false, false);
    }
  }
}
