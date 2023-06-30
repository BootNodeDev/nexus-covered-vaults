// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

// Used for integration tests only
interface IStakingPoolFactory {
  function stakingPoolCount() external view returns (uint256);
}
