// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

// Used for integration tests only
interface IStakingPool {
  function depositTo(
    uint amount,
    uint trancheId,
    uint requestTokenId,
    address destination
  ) external returns (uint tokenId);
}
