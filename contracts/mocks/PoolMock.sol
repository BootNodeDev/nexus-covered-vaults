// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import { IPool, Asset } from "./../interfaces/IPool.sol";

contract PoolMock is IPool {
  constructor() {
    // solhint-disable-previous-line no-empty-blocks
  }

  address constant eth = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
  address constant someERC20 = 0xE0f5206BBD039e7b0592d8918820024e2a7437b9;

  function getAsset(uint256 assetId) external pure returns (Asset memory) {
    if (assetId == 0) {
      return Asset(eth, false, false);
    } else {
      return Asset(someERC20, false, false);
    }
  }
}
