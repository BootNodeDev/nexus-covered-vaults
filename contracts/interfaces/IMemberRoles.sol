// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.17;

// Used for integration tests only
interface IMemberRoles {
  function switchMembership(address _newAddress) external;
}
