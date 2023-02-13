// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import { BuyCoverParams, PoolAllocationRequest } from "./../interfaces/ICover.sol";
import { IPool } from "./../interfaces/IPool.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract CoverMock {
  address public pool;
  uint256 public constant PREMIUM_DENOMINATOR = 1e4;
  uint256 public premium = 100; // 1%
  uint256 public coverId = 1;

  error CoverMock_PremiumTooHigh();
  error CoverMock_PremiumAmountHigherThanMaxPremium();
  error CoverMock_InsufficientETHForPremium();
  error CoverMock_EthSendFailed();

  constructor(address _pool) {
    pool = _pool;
  }

  function setPremium(uint256 _premium) public {
    if (_premium > PREMIUM_DENOMINATOR) revert CoverMock_PremiumTooHigh();
    premium = _premium;
  }

  function buyCover(
    BuyCoverParams calldata params,
    PoolAllocationRequest[] calldata /* coverChunkRequests */
  ) external payable returns (uint256) {
    uint256 amountToPay = ((params.amount * premium) / PREMIUM_DENOMINATOR);
    if (amountToPay > params.maxPremiumInAsset) {
      revert CoverMock_PremiumAmountHigherThanMaxPremium();
    }

    address asset = IPool(pool).getAsset(params.paymentAsset).assetAddress;

    bool isETH = params.paymentAsset == 0;

    if (isETH) {
      if (amountToPay > msg.value) {
        revert CoverMock_InsufficientETHForPremium();
      }
      uint256 remaining = msg.value - amountToPay;
      if (remaining > 0) {
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, ) = address(msg.sender).call{ value: remaining }("");
        if (!success) revert CoverMock_EthSendFailed();
      }
    } else {
      SafeERC20.safeTransferFrom(IERC20(asset), msg.sender, address(this), params.maxPremiumInAsset);

      uint256 remaining = params.maxPremiumInAsset - amountToPay;
      if (remaining > 0) {
        SafeERC20.safeTransfer(IERC20(asset), msg.sender, remaining);
      }
    }

    return (params.coverId == 0) ? ++coverId : params.coverId;
  }
}
