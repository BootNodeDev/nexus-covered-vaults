// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import { BuyCoverParams, PoolAllocationRequest } from "./../interfaces/ICover.sol";

contract CoverMock {
  constructor() {
    // solhint-disable-previous-line no-empty-blocks
  }

  // TODO tener un setter de cuanto se va a cobrar si el 100% o menos

  function buyCover(BuyCoverParams calldata params, PoolAllocationRequest[] calldata coverChunkRequests)
    external
    payable
    returns (uint256 coverId)
  {
    // solhint-disable-previous-line no-empty-blocks
    // Mandar del coverManager (sender) a la cuenta en premium asset. Logica muy similar,
    // TODO pero no siempre es esa cantidad del premium
  }
}
