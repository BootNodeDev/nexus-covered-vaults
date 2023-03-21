// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract YieldTokenIncidentsMock {
  uint256 public payoutAmount;
  IERC20 public yieldTokenAddress;
  IERC20 public underlyingAsset;

  constructor() {
    // solhint-disable-previous-line no-empty-blocks
  }

  function redeemPayout(
    uint104 /* incidentId */,
    uint32 /* coverId */,
    uint /* segmentId */,
    uint depeggedTokens,
    address payable payoutAddress,
    bytes calldata /* optionalParams */
  ) external returns (uint256, uint8) {
    yieldTokenAddress.transferFrom(msg.sender, address(this), depeggedTokens);
    underlyingAsset.transfer(payoutAddress, payoutAmount);

    return (payoutAmount, 0);
  }

  function setPayoutAmount(uint256 _payoutAmount, IERC20 _yieldTokenAddress, IERC20 _underlyingAsset) public {
    payoutAmount = _payoutAmount;
    yieldTokenAddress = _yieldTokenAddress;
    underlyingAsset = _underlyingAsset;
  }
}
