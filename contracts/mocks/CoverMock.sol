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

  error MaxPremiumSetToHigh();
  error PremiumAmountHigherThanMaxPremium();
  error EthSendFailed();

  constructor(address _pool) {
    pool = _pool;
  }

  function setPremium(uint256 _premium) public {
    if (_premium > PREMIUM_DENOMINATOR) revert MaxPremiumSetToHigh();
    premium = _premium;
  }

  function buyCover(BuyCoverParams calldata params, PoolAllocationRequest[] calldata coverChunkRequests)
    external
    payable
    returns (uint256)
  {
    uint256 premiumAmount = ((params.amount * premium) / PREMIUM_DENOMINATOR);
    uint256 amountToPay = params.amount + premiumAmount;
    if (premiumAmount > params.maxPremiumInAsset) {
      revert PremiumAmountHigherThanMaxPremium();
    }

    address asset = IPool(pool).getAsset(params.paymentAsset).assetAddress;

    bool isETH = params.paymentAsset == 0;

    if (isETH) {
      uint256 remaining = msg.value > amountToPay ? msg.value - amountToPay : 0;
      // solhint-disable-next-line avoid-low-level-calls
      if (remaining > 0) {
        (bool success, ) = address(msg.sender).call{ value: remaining }("");
        if (!success) revert EthSendFailed();
      }
    } else {
      uint256 remaining = params.amount > amountToPay ? params.amount - amountToPay : 0;
      if (remaining > 0) {
        SafeERC20.safeTransferFrom(IERC20(asset), msg.sender, address(this), remaining);
      }
    }

    return (params.coverId == 0) ? ++coverId : params.coverId;
  }
}
