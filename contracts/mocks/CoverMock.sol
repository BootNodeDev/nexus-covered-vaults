// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import { BuyCoverParams, PoolAllocationRequest } from "./../interfaces/ICover.sol";
import { IPool } from "./../interfaces/IPool.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract CoverMock {
  address public pool;
  uint256 public constant PREMIUM_DENOMINATOR = 1e4;
  uint256 public premium = 1e4;
  uint256 public coverId = 1;

  constructor(address _pool) {
    pool = _pool;
  }

  function setPremium(uint256 _premium) public {
    require(_premium <= PREMIUM_DENOMINATOR, "Premium exceeds 100%");
    premium = _premium;
  }

  function buyCover(
    BuyCoverParams calldata params /*, PoolAllocationRequest[] calldata coverChunkRequests */
  ) external payable returns (uint256) {
    bool isETH = params.paymentAsset == 0;
    uint256 amountToPay = params.amount + ((params.amount * premium) / PREMIUM_DENOMINATOR);
    // TODO Check uint256 maxPremium = params.maxPremiumInAsset;

    address asset = IPool(pool).getAsset(params.paymentAsset).assetAddress;

    if (isETH) {
      // solhint-disable-next-line avoid-low-level-calls
      (bool success, ) = address(msg.sender).call{ value: msg.value - amountToPay }("");
      require(success, "ETH Send failed");
    } else {
      SafeERC20.safeTransferFrom(IERC20(asset), msg.sender, address(this), amountToPay);
    }

    return (params.coverId == 0) ? ++coverId : params.coverId;
  }
}
