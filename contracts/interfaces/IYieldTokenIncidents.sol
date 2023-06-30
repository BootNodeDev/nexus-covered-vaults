// SPDX-License-Identifier: MIT

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

  // Used for integration tests only
  function submitIncident(
    uint24 productId,
    uint96 priceBefore,
    uint32 date,
    uint expectedPayoutInNXM,
    string calldata ipfsMetadata
  ) external;

  event IncidentSubmitted(address user, uint incidentId, uint productId, uint expectedPayoutInNXM);
}
