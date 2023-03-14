// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.17;

interface IYieldTokenIncidents {
  function redeemPayout(
    uint104 incidentId,
    uint32 coverId,
    uint segmentId,
    uint depeggedTokens,
    address payable payoutAddress,
    bytes calldata optionalParams
  ) external returns (uint payoutAmount, uint8 coverAsset);
}
