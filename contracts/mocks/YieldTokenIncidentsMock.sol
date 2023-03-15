// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

contract YieldTokenIncidentsMock {
  constructor() {
    // solhint-disable-previous-line no-empty-blocks
  }

  function redeemPayout(
    uint104 incidentId,
    uint32 coverId,
    uint segmentId,
    uint depeggedTokens,
    address payable payoutAddress,
    bytes calldata optionalParams
  ) external returns (uint, uint8) {
    // solhint-disable-previous-line no-empty-blocks
  }
}
